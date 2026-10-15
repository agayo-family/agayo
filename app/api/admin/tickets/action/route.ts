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
    const inventoryAction = ['cancel_ticket','restore_ticket','reset_scan'].includes(action);
    if (!inventoryAction && !['refund_ticket_policy','refund_order'].includes(action)) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
    await requireAdminPermission(inventoryAction ? 'manage_ticket_inventory' : 'view_revenue');
    if (!ticketId) return NextResponse.json({ error: "Билет не указан" }, { status: 400 });

    const sql = db();
    const rows = await sql`
      SELECT
        t.id,t.public_id,t.user_id,t.event_slug,t.category_id,t.status,t.used_at,t.order_id,
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
      const result = await sql.begin(async (tx: any) => {
        // Match checkout's event -> category order. Payment/refund processors
        // lock the order before changing its tickets, so take those locks next.
        const [event] = await tx`SELECT id FROM events WHERE slug=${ticket.event_slug} FOR UPDATE`;
        if (!event) throw new AdminAccessError("Мероприятие не найдено", 409);
        const [category] = await tx`SELECT id,inventory FROM event_ticket_categories
          WHERE event_id=${event.id} AND category_key=${ticket.category_id} FOR UPDATE`;
        if (!category) throw new AdminAccessError("Категория билета не найдена", 409);
        const [order] = await tx`SELECT status FROM orders WHERE id=${ticket.order_id} FOR UPDATE`;
        const [current] = await tx`SELECT status FROM tickets WHERE id=${ticket.id}
          AND order_id=${ticket.order_id} AND event_slug=${ticket.event_slug} AND category_id=${ticket.category_id} FOR UPDATE`;
        const [refund] = await tx`SELECT status FROM ticket_refunds WHERE ticket_id=${ticket.id} FOR UPDATE`;
        if (order?.status !== "paid") throw new AdminAccessError("Нельзя восстановить билет у закрытого или возвращённого заказа", 409);
        // A failed intent may still be a provider timeout with an unknown result.
        if (refund) throw new AdminAccessError("Для билета уже запрашивали возврат. Сверьте его результат у платёжного провайдера перед восстановлением", 409);
        if (current?.status === "valid") return { ok: true, state: "valid", message: "Билет уже действителен" };
        if (current?.status !== "cancelled") throw new AdminAccessError("Восстановить можно только вручную отменённый билет", 409);
        if (category.inventory != null) {
          const [counts] = await tx`SELECT
            (SELECT COUNT(*)::int FROM tickets WHERE event_slug=${ticket.event_slug} AND category_id=${ticket.category_id} AND status IN ('valid','used')) AS sold,
            (SELECT COALESCE(SUM(quantity),0)::int FROM ticket_inventory_reservations WHERE event_slug=${ticket.event_slug} AND category_id=${ticket.category_id} AND consumed_at IS NULL AND released_at IS NULL) AS reserved,
            (SELECT COALESCE(SUM(oi.quantity),0)::int FROM order_items oi JOIN orders o ON o.id=oi.order_id
              WHERE o.event_slug=${ticket.event_slug} AND oi.ticket_category_id=${ticket.category_id} AND o.status='pending'
                AND NOT EXISTS (SELECT 1 FROM ticket_inventory_reservations r WHERE r.order_id=o.id AND r.event_slug=o.event_slug
                  AND r.category_id=oi.ticket_category_id AND r.consumed_at IS NULL AND r.released_at IS NULL)) AS unreserved_pending`;
          if (Number(counts.sold || 0) + Number(counts.reserved || 0) + Number(counts.unreserved_pending || 0) >= Number(category.inventory)) {
            throw new AdminAccessError("Не осталось свободных билетов этой категории. Увеличь лимит перед восстановлением", 409);
          }
        }
        await tx`UPDATE tickets SET status='valid',used_at=NULL,used_by=NULL WHERE id=${ticket.id} AND status='cancelled'`;
        await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
          VALUES(${actor.userId},'ticket.restore','ticket',${String(ticket.id)},
            ${JSON.stringify({ publicId:String(ticket.public_id),eventSlug:String(ticket.event_slug),orderPublicId:String(ticket.order_public_id) })}::jsonb)`;
        return { ok: true, state: "valid", message: "Билет снова действителен" };
      });
      return NextResponse.json(result);
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
