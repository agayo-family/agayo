import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { createRefund, getPayment } from "@/lib/server/yookassa";
import { syncYooKassaRefund } from "@/lib/server/payment-processing";
import { updateUserLoyaltyByVisits } from "@/lib/server/loyalty";

export const runtime = "nodejs";

function clean(value: unknown, max = 100) {
  return String(value ?? "").trim().slice(0, max);
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
        o.public_id AS order_public_id,o.status AS order_status,o.total,o.refunded_amount,o.yookassa_payment_id
      FROM tickets t
      JOIN orders o ON o.id=t.order_id
      WHERE t.id=${ticketId}
      LIMIT 1
    `;
    const ticket = rows[0];
    if (!ticket) return NextResponse.json({ error: "Билет не найден" }, { status: 404 });

    if (action === "cancel_ticket") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.status === "cancelled") return NextResponse.json({ ok: true, state: "cancelled", message: "Билет уже отменён" });
      if (ticket.status !== "valid") {
        return NextResponse.json({ error: "Отменить можно только действительный неиспользованный билет" }, { status: 409 });
      }
      await sql`UPDATE tickets SET status='cancelled' WHERE id=${ticket.id} AND status='valid'`;
      await writeAdminAudit(actor.userId, "ticket.cancel", "ticket", String(ticket.id), {
        publicId: String(ticket.public_id), eventSlug: String(ticket.event_slug), orderPublicId: String(ticket.order_public_id),
      });
      return NextResponse.json({ ok: true, state: "cancelled", message: "Билет отменён. Деньги не возвращались." });
    }

    if (action === "restore_ticket") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.order_status !== "paid") {
        return NextResponse.json({ error: "Нельзя восстановить билет у закрытого или возвращённого заказа" }, { status: 409 });
      }
      if (ticket.status === "valid") return NextResponse.json({ ok: true, state: "valid", message: "Билет уже действителен" });
      if (ticket.status !== "cancelled") {
        return NextResponse.json({ error: "Восстановить можно только вручную отменённый билет" }, { status: 409 });
      }
      await sql`UPDATE tickets SET status='valid',used_at=NULL,used_by=NULL WHERE id=${ticket.id} AND status='cancelled'`;
      await writeAdminAudit(actor.userId, "ticket.restore", "ticket", String(ticket.id), {
        publicId: String(ticket.public_id), eventSlug: String(ticket.event_slug), orderPublicId: String(ticket.order_public_id),
      });
      return NextResponse.json({ ok: true, state: "valid", message: "Билет снова действителен" });
    }

    if (action === "reset_scan") {
      const actor = await requireAdminPermission("manage_ticket_inventory", String(ticket.event_slug));
      if (ticket.status !== "used") {
        return NextResponse.json({ error: "Сбросить проход можно только у использованного билета" }, { status: 409 });
      }
      await sql`UPDATE tickets SET status='valid',used_at=NULL,used_by=NULL WHERE id=${ticket.id} AND status='used'`;
      await updateUserLoyaltyByVisits(String(ticket.user_id));
      await writeAdminAudit(actor.userId, "ticket.scan_reset", "ticket", String(ticket.id), {
        publicId: String(ticket.public_id), eventSlug: String(ticket.event_slug), orderPublicId: String(ticket.order_public_id),
      });
      return NextResponse.json({ ok: true, state: "valid", message: "Проход сброшен — билет снова можно сканировать" });
    }

    if (action === "refund_order") {
      const actor = await requireAdminPermission("view_revenue", String(ticket.event_slug));
      if (!ticket.yookassa_payment_id) {
        return NextResponse.json({ error: "У заказа нет идентификатора платежа YooKassa" }, { status: 409 });
      }
      if (ticket.order_status === "refunded") {
        return NextResponse.json({ ok: true, state: "refunded", message: "Заказ уже полностью возвращён" });
      }
      if (ticket.order_status !== "paid") {
        return NextResponse.json({ error: "Возврат можно сделать только по оплаченному заказу" }, { status: 409 });
      }

      const paymentId = String(ticket.yookassa_payment_id);
      const payment = await getPayment(paymentId);
      if (payment.status !== "succeeded" || !payment.paid) {
        return NextResponse.json({ error: `YooKassa не подтверждает успешный платёж: ${payment.status}` }, { status: 409 });
      }
      if (payment.amount.currency !== "RUB") {
        return NextResponse.json({ error: "Неподдерживаемая валюта платежа" }, { status: 409 });
      }

      const orderTotal = Number(ticket.total || 0);
      const alreadyRefunded = Number(payment.refunded_amount?.value || 0);
      const remaining = Math.max(0, orderTotal - alreadyRefunded);

      // Если YooKassa уже видит полный возврат, но webhook не успел обновить БД,
      // приводим AGAYO к авторитетному состоянию YooKassa без второго возврата.
      if (remaining < 0.005) {
        await sql.begin(async (tx: any) => {
          await tx`
            UPDATE orders
            SET status='refunded',refunded_at=COALESCE(refunded_at,now()),refunded_amount=${Math.round(alreadyRefunded)}
            WHERE id=${ticket.order_id}
          `;
          await tx`UPDATE tickets SET status='refunded' WHERE order_id=${ticket.order_id} AND status IN ('valid','used','cancelled')`;
        });
        await updateUserLoyaltyByVisits(String(ticket.user_id));
        await writeAdminAudit(actor.userId, "order.refund.reconcile", "order", String(ticket.order_id), {
          orderPublicId: String(ticket.order_public_id), paymentId,
        });
        return NextResponse.json({ ok: true, state: "refunded", message: "Возврат уже был выполнен в YooKassa. Статус AGAYO синхронизирован." });
      }

      if (Math.abs(remaining - orderTotal) > 0.005) {
        return NextResponse.json({
          error: "По заказу уже есть частичный возврат. Полный остаточный возврат из этой панели заблокирован, чтобы не сформировать некорректный чек. Проверь платёж в YooKassa.",
        }, { status: 409 });
      }

      const refund = await createRefund({
        paymentId,
        amount: remaining,
        idempotenceKey: `AGAYO-REFUND-${ticket.order_public_id}-FULL`,
        description: `Полный возврат заказа ${ticket.order_public_id}`,
      });

      let state = String(refund.status || "pending");
      if (refund.status === "succeeded") {
        const synced = await syncYooKassaRefund(String(refund.id));
        state = synced.state;
      }

      await writeAdminAudit(actor.userId, "order.refund.create", "order", String(ticket.order_id), {
        orderPublicId: String(ticket.order_public_id), paymentId, refundId: String(refund.id), amount: remaining, state,
      });

      return NextResponse.json({
        ok: true,
        state,
        refundId: refund.id,
        message: state === "refunded"
          ? "Полный возврат выполнен. Все билеты заказа стали недействительными."
          : "Возврат создан в YooKassa и обрабатывается. Статус обновится по webhook.",
      });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    console.error("Admin ticket action:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить действие" }, { status });
  }
}
