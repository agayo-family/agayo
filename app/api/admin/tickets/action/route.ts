import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { createRefund, getPayment } from "@/lib/server/yookassa";
import { syncYooKassaRefund } from "@/lib/server/payment-processing";
import { updateUserLoyaltyByVisits } from "@/lib/server/loyalty";
import { getRefundPolicyQuote, refundAmountForShare } from "@/lib/server/refund-policy";
import { getTicketPaidShare } from "@/lib/server/ticket-refunds";
import { markNpdAfterRefund } from "@/lib/server/npd";

export const runtime = "nodejs";

function clean(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

function money(value:number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticketId = clean(body.ticketId, 80);
    const action = clean(body.action, 40);
    if (!ticketId) return NextResponse.json({ error: "Билет не указан" }, { status: 400 });

    const sql = db();
    const rows = await sql`
      SELECT
        t.id,t.public_id,t.user_id,t.event_slug,t.status,t.used_at,t.order_id,
        o.public_id AS order_public_id,o.status AS order_status,o.total,o.subtotal,o.refunded_amount,o.yookassa_payment_id,
        e.starts_at AS event_starts_at
      FROM tickets t
      JOIN orders o ON o.id=t.order_id
      LEFT JOIN events e ON e.slug=t.event_slug
      WHERE t.id=${ticketId}
      LIMIT 1
    `;
    const ticket = rows[0];
    if (!ticket) return NextResponse.json({ error: "Билет не найден" }, { status: 404 });

    if (action === "cancel_ticket") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.status === "cancelled") return NextResponse.json({ ok: true, state: "cancelled", message: "Билет уже отменён" });
      if (ticket.status !== "valid") return NextResponse.json({ error: "Отменить можно только действительный неиспользованный билет" }, { status: 409 });
      await sql`UPDATE tickets SET status='cancelled' WHERE id=${ticket.id} AND status='valid'`;
      await writeAdminAudit(actor.userId, "ticket.cancel", "ticket", String(ticket.id), { publicId:String(ticket.public_id),eventSlug:String(ticket.event_slug),orderPublicId:String(ticket.order_public_id) });
      return NextResponse.json({ ok: true, state: "cancelled", message: "Билет отменён. Деньги не возвращались." });
    }

    if (action === "restore_ticket") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.order_status !== "paid") return NextResponse.json({ error: "Нельзя восстановить билет у закрытого или возвращённого заказа" }, { status: 409 });
      const [refund] = await sql`SELECT status FROM ticket_refunds WHERE ticket_id=${ticket.id} LIMIT 1`;
      if (refund?.status === "succeeded") return NextResponse.json({ error: "Нельзя восстановить билет после денежного возврата" }, { status: 409 });
      if (ticket.status === "valid") return NextResponse.json({ ok: true, state: "valid", message: "Билет уже действителен" });
      if (ticket.status !== "cancelled") return NextResponse.json({ error: "Восстановить можно только вручную отменённый билет" }, { status: 409 });
      await sql`UPDATE tickets SET status='valid',used_at=NULL,used_by=NULL WHERE id=${ticket.id} AND status='cancelled'`;
      await writeAdminAudit(actor.userId, "ticket.restore", "ticket", String(ticket.id), { publicId:String(ticket.public_id),eventSlug:String(ticket.event_slug),orderPublicId:String(ticket.order_public_id) });
      return NextResponse.json({ ok: true, state: "valid", message: "Билет снова действителен" });
    }

    if (action === "reset_scan") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.status !== "used") return NextResponse.json({ error: "Сбросить проход можно только у использованного билета" }, { status: 409 });
      await sql`UPDATE tickets SET status='valid',used_at=NULL,used_by=NULL WHERE id=${ticket.id} AND status='used'`;
      await updateUserLoyaltyByVisits(String(ticket.user_id));
      await writeAdminAudit(actor.userId, "ticket.scan_reset", "ticket", String(ticket.id), { publicId:String(ticket.public_id),eventSlug:String(ticket.event_slug),orderPublicId:String(ticket.order_public_id) });
      return NextResponse.json({ ok: true, state: "valid", message: "Проход сброшен — билет снова можно сканировать" });
    }

    if (action === "refund_ticket_policy") {
      const actor = await requireAdminPermission("view_revenue", String(ticket.event_slug));
      if (!ticket.yookassa_payment_id) return NextResponse.json({ error: "У заказа нет идентификатора платежа YooKassa" }, { status: 409 });
      if (ticket.order_status !== "paid") return NextResponse.json({ error: "Возврат можно сделать только по оплаченному заказу" }, { status: 409 });
      if (!['valid','cancelled'].includes(String(ticket.status))) return NextResponse.json({ error: "Возврат по билету доступен только до его использования" }, { status: 409 });
      if (!ticket.event_starts_at) return NextResponse.json({ error: "Не удалось определить дату мероприятия" }, { status: 409 });

      const quote = getRefundPolicyQuote(String(ticket.event_starts_at));
      if (quote.percent === 0) return NextResponse.json({ error: quote.label }, { status: 409 });

      const existingRows = await sql`SELECT * FROM ticket_refunds WHERE ticket_id=${ticket.id} LIMIT 1`;
      const existing = existingRows[0];
      if (existing?.status === 'succeeded') {
        return NextResponse.json({ ok:true,state:'partial_refund',message:`По этому билету уже возвращено ${money(Number(existing.amount))} ₽ (${existing.refund_percent}%).` });
      }
      if (existing?.status === 'pending' && existing.yookassa_refund_id) {
        const synced = await syncYooKassaRefund(String(existing.yookassa_refund_id));
        return NextResponse.json({ ok:true,state:synced.state,message:"Возврат уже был создан. AGAYO сверил его актуальный статус с YooKassa." });
      }

      const share = await getTicketPaidShare(String(ticket.order_id),String(ticket.id),sql);
      if (!share || share.paidShare <= 0) return NextResponse.json({ error:"Не удалось рассчитать оплаченную стоимость этого билета" }, { status:409 });
      const amount = refundAmountForShare(share.paidShare,quote.percent);
      if (amount < 1) return NextResponse.json({ error:"Рассчитанная сумма возврата меньше минимальной суммы YooKassa — 1 ₽" }, { status:409 });

      const payment = await getPayment(String(ticket.yookassa_payment_id));
      if (payment.status !== "succeeded" || !payment.paid) return NextResponse.json({ error:`YooKassa не подтверждает успешный платёж: ${payment.status}` }, { status:409 });
      if (payment.amount.currency !== "RUB") return NextResponse.json({ error:"Неподдерживаемая валюта платежа" }, { status:409 });
      const alreadyRefunded = Number(payment.refunded_amount?.value || 0);
      const paymentTotal = Number(payment.amount.value || 0);
      const available = Math.max(0,Math.round((paymentTotal-alreadyRefunded)*100)/100);
      if (amount - available > 0.001) return NextResponse.json({ error:`В платеже осталось доступно для возврата только ${available.toFixed(2)} ₽` }, { status:409 });

      const refundRow = await sql`
        INSERT INTO ticket_refunds(ticket_id,order_id,refund_percent,amount,status,reason,created_by)
        VALUES(${ticket.id},${ticket.order_id},${quote.percent},${amount},'pending','customer_return',${actor.userId})
        ON CONFLICT (ticket_id) DO UPDATE
        SET refund_percent=EXCLUDED.refund_percent,amount=EXCLUDED.amount,status='pending',reason='customer_return',created_by=EXCLUDED.created_by,updated_at=now()
        WHERE ticket_refunds.status='failed'
        RETURNING *
      `;
      if (!refundRow[0] && existing?.status === 'pending') return NextResponse.json({ error:"Возврат уже обрабатывается" }, { status:409 });

      try {
        const refund = await createRefund({
          paymentId:String(ticket.yookassa_payment_id),
          amount,
          partial:amount + 0.001 < paymentTotal || alreadyRefunded > 0,
          idempotenceKey:`AGAYO-TICKET-${ticket.public_id}-${quote.percent}`,
          description:`Возврат ${quote.percent}% билета ${ticket.public_id}`,
        });
        await sql`
          UPDATE ticket_refunds
          SET yookassa_refund_id=${String(refund.id)},status=${refund.status === 'succeeded' ? 'succeeded' : 'pending'},updated_at=now(),succeeded_at=${refund.status === 'succeeded' ? new Date() : null}
          WHERE ticket_id=${ticket.id}
        `;
        let state=String(refund.status || 'pending');
        if (refund.status === 'succeeded') state=(await syncYooKassaRefund(String(refund.id))).state;
        await writeAdminAudit(actor.userId,"ticket.refund.create","ticket",String(ticket.id),{
          publicId:String(ticket.public_id),orderPublicId:String(ticket.order_public_id),refundId:String(refund.id),percent:quote.percent,amount,state,
        });
        return NextResponse.json({
          ok:true,state,refundId:refund.id,percent:quote.percent,amount,
          message:refund.status === 'succeeded'
            ? `Возврат ${quote.percent}% (${amount.toFixed(2)} ₽) выполнен. Билет больше не действует.`
            : `Возврат ${quote.percent}% (${amount.toFixed(2)} ₽) создан в YooKassa и обрабатывается.`,
        });
      } catch (error) {
        await sql`UPDATE ticket_refunds SET status='failed',updated_at=now() WHERE ticket_id=${ticket.id}`;
        throw error;
      }
    }

    if (action === "refund_order") {
      const actor = await requireAdminPermission("view_revenue", String(ticket.event_slug));
      if (!ticket.yookassa_payment_id) return NextResponse.json({ error: "У заказа нет идентификатора платежа YooKassa" }, { status: 409 });
      if (ticket.order_status === "refunded") return NextResponse.json({ ok:true,state:"refunded",message:"Заказ уже полностью возвращён" });
      if (ticket.order_status !== "paid") return NextResponse.json({ error:"Возврат можно сделать только по оплаченному заказу" }, { status:409 });

      const paymentId=String(ticket.yookassa_payment_id);
      const payment=await getPayment(paymentId);
      if(payment.status!=="succeeded"||!payment.paid) return NextResponse.json({error:`YooKassa не подтверждает успешный платёж: ${payment.status}`},{status:409});
      if(payment.amount.currency!=="RUB") return NextResponse.json({error:"Неподдерживаемая валюта платежа"},{status:409});

      const orderTotal=Number(ticket.total||0);
      const alreadyRefunded=Number(payment.refunded_amount?.value||0);
      const remaining=Math.max(0,Math.round((orderTotal-alreadyRefunded)*100)/100);
      if(remaining<0.005){
        await sql.begin(async(tx:any)=>{
          await tx`UPDATE orders SET status='refunded',refunded_at=COALESCE(refunded_at,now()),refunded_amount=${money(alreadyRefunded)} WHERE id=${ticket.order_id}`;
          await tx`UPDATE tickets SET status='refunded' WHERE order_id=${ticket.order_id} AND status IN ('valid','used','cancelled')`;
          await markNpdAfterRefund(String(ticket.order_id),0,tx);
        });
        await updateUserLoyaltyByVisits(String(ticket.user_id));
        return NextResponse.json({ok:true,state:"refunded",message:"Возврат уже был выполнен в YooKassa. Статус AGAYO синхронизирован."});
      }

      const refund=await createRefund({
        paymentId,amount:remaining,partial:alreadyRefunded>0,
        idempotenceKey:`AGAYO-REFUND-${ticket.order_public_id}-REMAINING`,
        description:`Возврат остатка заказа ${ticket.order_public_id}`,
      });
      let state=String(refund.status||"pending");
      if(refund.status==="succeeded") state=(await syncYooKassaRefund(String(refund.id))).state;
      await writeAdminAudit(actor.userId,"order.refund.create","order",String(ticket.order_id),{orderPublicId:String(ticket.order_public_id),paymentId,refundId:String(refund.id),amount:remaining,state});
      return NextResponse.json({ok:true,state,refundId:refund.id,message:state==="refunded"?"Оставшаяся сумма заказа возвращена. Все билеты заказа стали недействительными.":"Возврат остатка создан в YooKassa и обрабатывается."});
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    console.error("Admin ticket action:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить действие" }, { status });
  }
}
