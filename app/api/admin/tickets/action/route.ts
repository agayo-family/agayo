import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { createRefund, getPayment } from "@/lib/server/yookassa";
import { syncYooKassaRefund } from "@/lib/server/payment-processing";
import { updateUserLoyaltyByVisits } from "@/lib/server/loyalty";
import { getRefundPolicyQuote, refundAmountForShare } from "@/lib/server/refund-policy";
import { getTicketPaidShare } from "@/lib/server/ticket-refunds";
import { AdminRefundError, findAdminRefund, prepareAdminRefund, runAdminRefund } from '@/lib/server/admin-refund-store';
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
    if (!inventoryAction && !['refund_ticket_policy','refund_ticket_custom','refund_order'].includes(action)) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
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
        const [refund] = await tx`SELECT status,to_jsonb(r)->>'reason' AS reason FROM ticket_refunds r WHERE ticket_id=${ticket.id} FOR UPDATE`;
        if (order?.status !== "paid") throw new AdminAccessError("Нельзя восстановить билет у закрытого или возвращённого заказа", 409);
        // A failed intent may still be a provider timeout with an unknown result.
        if (refund && !(refund.status==='failed' && refund.reason==='provider_canceled')) throw new AdminAccessError("Для билета уже запрашивали возврат. Сверьте его результат у платёжного провайдера перед восстановлением", 409);
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
            ${JSON.stringify({ publicId:String(ticket.public_id),eventSlug:String(ticket.event_slug),orderPublicId:String(ticket.order_public_id) })}::text::jsonb)`;
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


    if (['refund_ticket_policy','refund_ticket_custom','refund_order'].includes(action)) {
      const actor = await requireAdminPermission("view_revenue", String(ticket.event_slug));
      const fullOrder = action === 'refund_order';
      const targetTicket = fullOrder ? null : String(ticket.id);
      const existingRequest = await findAdminRefund(sql, String(ticket.order_id), targetTicket);
      if (existingRequest) return NextResponse.json({ ok: true, ...await runAdminRefund(sql, existingRequest, {
        create: createRefund, sync: syncYooKassaRefund,
      }) });
      if (!ticket.yookassa_payment_id) return NextResponse.json({ error: "Бесплатный заказ не имеет платежа. Для него используй отмену билета." }, { status: 409 });
      if (ticket.order_status !== 'paid') return NextResponse.json({ error: "Возврат доступен только по оплаченному заказу" }, { status: 409 });
      const [legacy] = await sql`SELECT * FROM ticket_refunds WHERE ticket_id=${ticket.id} LIMIT 1`;
      if (!fullOrder && legacy) {
        if (legacy.yookassa_refund_id) {
          const synced = await syncYooKassaRefund(String(legacy.yookassa_refund_id));
          return NextResponse.json({ ok: true, state: synced.state, message: "Существующий возврат сверён с ЮKassa. Новая денежная операция не создавалась." });
        }
        return NextResponse.json({ error: "У прежнего запроса возврата неизвестен результат. Требуется сверка с ЮKassa; повторная денежная операция заблокирована." }, { status: 409 });
      }
      if (fullOrder) {
        const [unresolved] = await sql`SELECT ticket_id FROM ticket_refunds WHERE order_id=${ticket.order_id} AND status<>'succeeded' LIMIT 1`;
        if (unresolved) return NextResponse.json({ error: "Сначала сверь ранее запрошенный возврат одного из билетов заказа" }, { status: 409 });
      }
      if (!fullOrder && !['valid','cancelled'].includes(String(ticket.status))) return NextResponse.json({ error: "Возврат билета доступен только до его использования" }, { status: 409 });
      const payment = await getPayment(String(ticket.yookassa_payment_id));
      if (payment.status !== 'succeeded' || !payment.paid || payment.amount.currency !== 'RUB') return NextResponse.json({ error: "ЮKassa не подтверждает успешный рублёвый платёж" }, { status: 409 });
      const paymentTotal = money(Number(payment.amount.value || 0));
      const alreadyRefunded = money(Number(payment.refunded_amount?.value || 0));
      const available = money(Math.max(0, paymentTotal - alreadyRefunded));
      let amount: number, percent = 100;
      let reason = clean(body.reason, 600);
      if (fullOrder) {
        amount = money(Math.max(0, Number(ticket.total || 0) - alreadyRefunded));
        if (!reason) return NextResponse.json({ error: "Укажи основание полного возврата" }, { status: 400 });
        if (amount < 0.005) {
          await sql.begin(async (tx: any) => {
            await tx`SELECT id FROM orders WHERE id=${ticket.order_id} FOR UPDATE`;
            await tx`UPDATE orders SET status='refunded',refunded_at=coalesce(refunded_at,now()),refunded_amount=${alreadyRefunded} WHERE id=${ticket.order_id}`;
            await tx`UPDATE tickets SET status='refunded' WHERE order_id=${ticket.order_id} AND status IN ('valid','used','cancelled')`;
            await markNpdAfterRefund(String(ticket.order_id), 0, tx);
          });
          return NextResponse.json({ ok: true, state: 'refunded', message: 'Полный возврат уже подтверждён ЮKassa; статусы синхронизированы.' });
        }
      } else {
        const share = await getTicketPaidShare(String(ticket.order_id), String(ticket.id), sql);
        if (!share || share.paidShare <= 0) return NextResponse.json({ error: "Оплаченная доля билета не определена" }, { status: 409 });
        if (action === 'refund_ticket_custom') {
          amount = money(Number(body.refundAmount));
          if (reason.length < 10 || !Number.isFinite(Number(body.refundAmount)) || amount <= 0 || amount > share.paidShare) return NextResponse.json({ error: "Укажи основание (от 10 символов) и сумму не выше оплаченной доли билета" }, { status: 400 });
        } else {
          if (!ticket.event_starts_at) return NextResponse.json({ error: "Дата события не определена" }, { status: 409 });
          const quote = getRefundPolicyQuote(String(ticket.event_starts_at));
          percent = quote.percent;
          if (!percent) return NextResponse.json({ error: "По базовому графику 0%. Для обязательного исключения выбери обоснованную сумму или полный возврат." }, { status: 409 });
          amount = refundAmountForShare(share.paidShare, percent);
          reason = reason || `Добровольный возврат: ${quote.label}; условия покупки проверены администратором`;
        }
      }
      if (amount < 1 || amount > available) return NextResponse.json({ error: `Допустимая сумма от 1 ₽ до ${available.toFixed(2)} ₽` }, { status: 409 });
      if (body.expectedAmount != null && Math.abs(Number(body.expectedAmount)-amount)>0.005) return NextResponse.json({ error: 'Расчёт возврата изменился. Обнови список и заново подтверди актуальную сумму.' }, { status: 409 });
      const partial = amount + 0.001 < paymentTotal || alreadyRefunded > 0;
      if (partial && process.env.YOOKASSA_RECEIPT_REQUIRED === '1') return NextResponse.json({ error: "Частичный возврат требует состава фискального чека; он ещё не настроен для этого режима." }, { status: 409 });
      const request = await prepareAdminRefund(sql, {
        orderId: String(ticket.order_id), ticketId: targetTicket, actorId: actor.userId, reason,
        payload: { paymentId: String(ticket.yookassa_payment_id), amount, percent, partial,
          description: fullOrder ? `Возврат заказа ${ticket.order_public_id}` : `Возврат билета ${ticket.public_id}` },
      });
      return NextResponse.json({ ok: true, ...await runAdminRefund(sql, request, { create: createRefund, sync: syncYooKassaRefund }) });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : error instanceof AdminRefundError ? 409 : 500;
    console.error("Admin ticket action:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить действие" }, { status });
  }
}
