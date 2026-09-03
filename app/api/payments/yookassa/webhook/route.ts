import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getEventServer } from "@/lib/server/events";
import { getPayment } from "@/lib/server/yookassa";
import { publicId, randomToken } from "@/lib/server/security";
import { sendTicketEmail } from "@/lib/server/email";

export async function POST(request: Request) {
  try {
    const notification = await request.json();
    const paymentId = notification?.object?.id;
    if (!paymentId) return NextResponse.json({ ok: true });
    const payment = await getPayment(paymentId);
    if (payment.status !== "succeeded" || !payment.paid) return NextResponse.json({ ok: true });

    const sql = db();
    const orders = await sql`SELECT * FROM orders WHERE yookassa_payment_id=${payment.id} LIMIT 1`;
    const order = orders[0];
    if (!order || order.status === "paid") return NextResponse.json({ ok: true });
    if (Number(payment.amount.value) !== Number(order.total)) return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    const items = await sql`SELECT * FROM order_items WHERE order_id=${order.id}`;
    const event = await getEventServer(String(order.event_slug));
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 500 });

    const createdTickets: Array<{ public_id: string; qr_token: string }> = [];
    await sql.begin(async (tx: any) => {
      const locked = await tx`SELECT status FROM orders WHERE id=${order.id} FOR UPDATE`;
      if (locked[0]?.status === "paid") return;
      await tx`UPDATE orders SET status='paid', paid_at=now() WHERE id=${order.id}`;
      await tx`UPDATE ticket_inventory_reservations SET consumed_at=now() WHERE order_id=${order.id} AND released_at IS NULL`;
      for (const item of items) {
        for (let i = 0; i < Number(item.quantity); i++) {
          const ticketId = publicId("TKT"); const qr = randomToken(24);
          const rows = await tx`INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name) VALUES(${ticketId},${qr},${order.id},${order.user_id},${order.event_slug},${order.owner_name},${item.ticket_category_id},${item.ticket_category_name}) RETURNING public_id,qr_token`;
          createdTickets.push(rows[0] as { public_id: string; qr_token: string });
        }
      }
      if (order.promo_code) await tx`UPDATE promo_codes SET used_count=used_count+1 WHERE code=${order.promo_code}`;
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    await Promise.allSettled(createdTickets.map((ticket) => sendTicketEmail(order.email, event.title, ticket.public_id, `${base}/tickets/${ticket.qr_token}`)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
