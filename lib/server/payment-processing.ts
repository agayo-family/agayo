import { db } from "@/lib/server/db";
import { getEventServer } from "@/lib/server/events";
import { sendTicketEmail } from "@/lib/server/email";
import { getPayment, getRefund } from "@/lib/server/yookassa";
import { publicId, randomToken } from "@/lib/server/security";
import { updateUserLoyaltyByVisits } from "@/lib/server/loyalty";

type SyncResult = {
  state: "missing" | "pending" | "paid" | "canceled" | "refunded" | "partial_refund";
  orderPublicId?: string;
};

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function deliverOrderTickets(order: any, eventTitle: string, baseUrl: string) {
  const sql = db();
  const tickets = await sql`
    SELECT id,public_id,qr_token
    FROM tickets
    WHERE order_id=${order.id} AND status IN ('valid','used')
    ORDER BY created_at,id
  `;
  const failed: string[] = [];

  for (const ticket of tickets) {
    let sendError: string | null = null;
    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO ticket_deliveries(ticket_id,channel,destination,status)
        VALUES(${ticket.id},'email',${order.email},'pending')
        ON CONFLICT (ticket_id,channel) DO NOTHING
      `;
      const rows = await tx`
        SELECT id,status
        FROM ticket_deliveries
        WHERE ticket_id=${ticket.id} AND channel='email'
        FOR UPDATE
      `;
      const delivery = rows[0];
      if (!delivery || delivery.status === "sent") return;

      try {
        await sendTicketEmail(
          String(order.email),
          eventTitle,
          String(ticket.public_id),
          `${baseUrl}/tickets/${encodeURIComponent(String(ticket.qr_token))}`,
        );
        await tx`
          UPDATE ticket_deliveries
          SET status='sent',attempts=attempts+1,last_error=NULL,sent_at=now()
          WHERE id=${delivery.id}
        `;
      } catch (error) {
        sendError = errorText(error);
        await tx`
          UPDATE ticket_deliveries
          SET status='failed',attempts=attempts+1,last_error=${sendError}
          WHERE id=${delivery.id}
        `;
      }
    });
    if (sendError) failed.push(`${ticket.public_id}: ${sendError}`);
  }

  if (failed.length) throw new Error(`Не удалось отправить часть билетов: ${failed.join(" | ")}`);
}

async function resolveOrderForPayment(payment: Awaited<ReturnType<typeof getPayment>>) {
  const sql = db();
  let orders = await sql`SELECT * FROM orders WHERE yookassa_payment_id=${payment.id} LIMIT 1`;
  let order = orders[0];
  const metadataOrder = String(payment.metadata?.orderPublicId || "").trim();

  // A very fast webhook can arrive between createPayment() and saving the
  // YooKassa id. Recover the order by our signed server-side metadata and link it.
  if (!order && metadataOrder) {
    orders = await sql`SELECT * FROM orders WHERE public_id=${metadataOrder} LIMIT 1`;
    order = orders[0];
    if (order) {
      if (order.yookassa_payment_id && String(order.yookassa_payment_id) !== payment.id) {
        throw new Error(`Order ${order.public_id} is already linked to another payment`);
      }
      await sql`
        UPDATE orders
        SET yookassa_payment_id=${payment.id}
        WHERE id=${order.id} AND (yookassa_payment_id IS NULL OR yookassa_payment_id=${payment.id})
      `;
      order.yookassa_payment_id = payment.id;
    }
  }

  if (order && metadataOrder && metadataOrder !== String(order.public_id)) {
    throw new Error(`YooKassa metadata mismatch for ${order.public_id}`);
  }
  return order;
}

async function releaseOrderReservations(tx: any, orderId: string) {
  await tx`
    UPDATE ticket_inventory_reservations
    SET released_at=COALESCE(released_at,now())
    WHERE order_id=${orderId} AND consumed_at IS NULL
  `;
  try {
    await tx`
      UPDATE promo_code_reservations
      SET released_at=COALESCE(released_at,now())
      WHERE order_id=${orderId} AND consumed_at IS NULL
    `;
  } catch (error) {
    console.warn('Promo reservation release:', error instanceof Error ? error.message : error);
  }
}

async function consumePromoReservation(tx: any, order: any) {
  try {
    const reserved = await tx`
      UPDATE promo_code_reservations
      SET consumed_at=COALESCE(consumed_at,now())
      WHERE order_id=${order.id} AND consumed_at IS NULL AND released_at IS NULL
      RETURNING promo_code_id
    `;
    if (reserved[0]) {
      await tx`UPDATE promo_codes SET used_count=used_count+1 WHERE id=${reserved[0].promo_code_id}`;
      return;
    }
  } catch (error) {
    console.warn('Promo reservation consume:', error instanceof Error ? error.message : error);
  }

  // Backward compatibility for v12 orders created before migration 008.
  if (order.promo_code) await tx`UPDATE promo_codes SET used_count=used_count+1 WHERE code=${order.promo_code}`;
}

export async function retryOrderTicketDelivery(orderPublicId: string, baseUrl: string) {
  const sql = db();
  const rows = await sql`SELECT * FROM orders WHERE public_id=${orderPublicId} AND status='paid' LIMIT 1`;
  const order = rows[0];
  if (!order) return false;
  const event = await getEventServer(String(order.event_slug));
  if (!event) return false;
  await deliverOrderTickets(order,event.title,baseUrl);
  return true;
}

export async function syncYooKassaPayment(paymentId: string, baseUrl: string): Promise<SyncResult> {
  const payment = await getPayment(paymentId);
  const sql = db();
  const order = await resolveOrderForPayment(payment);
  if (!order) return { state: "missing" };

  if (Number(payment.amount.value) !== Number(order.total) || payment.amount.currency !== String(order.currency || "RUB")) {
    throw new Error(`YooKassa amount mismatch for ${order.public_id}`);
  }

  if (payment.status === "canceled") {
    await sql.begin(async (tx: any) => {
      const locked = await tx`SELECT status FROM orders WHERE id=${order.id} FOR UPDATE`;
      if (locked[0]?.status === "paid" || locked[0]?.status === "refunded") return;
      await tx`UPDATE orders SET status='cancelled' WHERE id=${order.id} AND status='pending'`;
      await releaseOrderReservations(tx,String(order.id));
    });
    return { state: "canceled", orderPublicId: String(order.public_id) };
  }

  if (payment.status !== "succeeded" || !payment.paid) {
    return { state: "pending", orderPublicId: String(order.public_id) };
  }

  const event = await getEventServer(String(order.event_slug));
  if (!event) throw new Error("Event not found");

  await sql.begin(async (tx: any) => {
    const locked = await tx`SELECT status FROM orders WHERE id=${order.id} FOR UPDATE`;
    const status = String(locked[0]?.status || "");
    if (status === "paid") return;
    if (status !== "pending") throw new Error(`Paid YooKassa payment is linked to closed order ${order.public_id} (${status})`);

    const items = await tx`SELECT * FROM order_items WHERE order_id=${order.id}`;
    await tx`UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,now()) WHERE id=${order.id}`;
    await tx`
      UPDATE ticket_inventory_reservations
      SET consumed_at=COALESCE(consumed_at,now())
      WHERE order_id=${order.id} AND released_at IS NULL
    `;

    for (const item of items) {
      for (let i = 0; i < Number(item.quantity); i++) {
        const ticketId = publicId("TKT");
        const qr = randomToken(24);
        await tx`
          INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name)
          VALUES(${ticketId},${qr},${order.id},${order.user_id},${order.event_slug},${order.owner_name},${item.ticket_category_id},${item.ticket_category_name})
        `;
      }
    }
    await consumePromoReservation(tx,order);
  });

  await deliverOrderTickets(order,event.title,baseUrl);
  return { state: "paid", orderPublicId: String(order.public_id) };
}

export async function syncYooKassaRefund(refundId: string): Promise<SyncResult> {
  const refund = await getRefund(refundId);
  if (refund.status !== 'succeeded') return { state:'pending' };

  const payment = await getPayment(String(refund.payment_id));
  const sql = db();
  const rows = await sql`SELECT * FROM orders WHERE yookassa_payment_id=${payment.id} LIMIT 1`;
  const order = rows[0];
  if (!order) return { state:'missing' };
  if (refund.amount.currency !== String(order.currency || 'RUB')) throw new Error(`YooKassa refund currency mismatch for ${order.public_id}`);

  const refundedAmount = Number(payment.refunded_amount?.value || refund.amount.value || 0);
  if (!Number.isFinite(refundedAmount)) throw new Error(`Invalid YooKassa refund amount for ${order.public_id}`);

  if (refundedAmount + 0.001 < Number(order.total)) {
    await sql`UPDATE orders SET refunded_amount=${Math.round(refundedAmount)} WHERE id=${order.id}`;
    return { state:'partial_refund',orderPublicId:String(order.public_id) };
  }

  await sql.begin(async (tx: any) => {
    const locked = await tx`SELECT status FROM orders WHERE id=${order.id} FOR UPDATE`;
    if (locked[0]?.status === 'refunded') return;
    if (locked[0]?.status !== 'paid') throw new Error(`Refund is linked to non-paid order ${order.public_id}`);
    await tx`
      UPDATE orders
      SET status='refunded',refunded_at=now(),refunded_amount=${Math.round(refundedAmount)}
      WHERE id=${order.id}
    `;
    await tx`UPDATE tickets SET status='refunded' WHERE order_id=${order.id} AND status IN ('valid','used')`;
  });

  await updateUserLoyaltyByVisits(String(order.user_id));
  return { state:'refunded',orderPublicId:String(order.public_id) };
}
