import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { retryOrderTicketDelivery, syncYooKassaPayment } from "@/lib/server/payment-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const normalized = decodeURIComponent(publicId || "").trim().slice(0, 80);
    if (!normalized) return NextResponse.json({ error: "Заказ не указан" }, { status: 400 });

    const sql = db();
    let rows = await sql`
      SELECT id,public_id,status,event_slug,yookassa_payment_id,paid_at,refunded_at,refunded_amount
      FROM orders
      WHERE public_id=${normalized}
      LIMIT 1
    `;
    let order = rows[0];
    if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    if (order.status === "pending" && order.yookassa_payment_id) {
      try {
        await syncYooKassaPayment(String(order.yookassa_payment_id), base);
      } catch (error) {
        console.warn("Order status reconciliation:", error instanceof Error ? error.message : error);
      }
      rows = await sql`
        SELECT id,public_id,status,event_slug,yookassa_payment_id,paid_at,refunded_at,refunded_amount
        FROM orders
        WHERE id=${order.id}
        LIMIT 1
      `;
      order = rows[0];
    }

    // A paid ticket must not depend on one successful email attempt. Reloading
    // the success page safely retries only deliveries not already marked sent.
    if (order.status === "paid") {
      try { await retryOrderTicketDelivery(String(order.public_id),base); }
      catch (error) { console.warn("Ticket delivery retry:", error instanceof Error ? error.message : error); }
    }

    const [ticketCount] = await sql`
      SELECT COUNT(*)::int AS count
      FROM tickets
      WHERE order_id=${order.id} AND status IN ('valid','used')
    `;
    const [delivery] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='sent')::int AS sent,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed
      FROM ticket_deliveries d
      JOIN tickets t ON t.id=d.ticket_id
      WHERE t.order_id=${order.id} AND d.channel='email'
    `;

    return NextResponse.json({
      orderId: String(order.public_id),
      status: String(order.status),
      eventSlug: String(order.event_slug),
      paidAt: order.paid_at || null,
      refundedAt: order.refunded_at || null,
      refundedAmount: Number(order.refunded_amount || 0),
      ticketCount: Number(ticketCount?.count || 0),
      delivery: {
        total: Number(delivery?.total || 0),
        sent: Number(delivery?.sent || 0),
        failed: Number(delivery?.failed || 0),
      },
    });
  } catch (error) {
    console.error("Order status:", error);
    return NextResponse.json({ error: "Не удалось проверить заказ" }, { status: 500 });
  }
}
