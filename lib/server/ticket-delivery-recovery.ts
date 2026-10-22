import { db } from './db';
import { getEventServer } from './events';
import { retryOrderTicketDelivery } from './payment-processing';
import { deliverPersonalBatch } from './personal-ticket-delivery';
import { emailConfiguration, explainStoredEmailError } from './email-transport';

export async function ticketDeliveryDiagnostics() {
  const sql = db();
  const config = emailConfiguration();
  const [counts] = await sql`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE d.status='sent')::int AS accepted,
    count(*) FILTER (WHERE d.status='failed')::int AS failed,
    count(*) FILTER (WHERE d.id IS NULL OR d.status='pending')::int AS pending
    FROM tickets t JOIN orders o ON o.id=t.order_id
    LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
    WHERE o.status='paid' AND t.status IN ('valid','used')`;
  const failures = await sql`SELECT t.public_id AS ticket_id,o.public_id AS order_id,t.event_slug,
    coalesce(d.status,'pending') AS status,coalesce(d.attempts,0)::int AS attempts,d.last_error
    FROM tickets t JOIN orders o ON o.id=t.order_id
    LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
    WHERE o.status='paid' AND t.status IN ('valid','used') AND (d.id IS NULL OR d.status<>'sent')
    ORDER BY o.paid_at,t.created_at LIMIT 50`;
  return {
    configuration: { configured: config.configured, senderDomain: config.senderDomain, sandbox: config.sandbox,
      productionReady: config.productionReady,
      note: !config.configured ? 'Не заданы ключ или корректный EMAIL_FROM.' : config.sandbox
        ? 'Тестовый отправитель resend.dev не отправляет билеты обычным покупателям.'
        : 'Настройки заданы. Подтверждение домена, лимиты и доставку в ящик нужно проверять в Resend.' },
    counts: { total: Number(counts?.total || 0), accepted: Number(counts?.accepted || 0),
      failed: Number(counts?.failed || 0), pending: Number(counts?.pending || 0) },
    failures: failures.map(row => ({ ticketId: String(row.ticket_id), orderId: String(row.order_id),
      eventSlug: String(row.event_slug), status: String(row.status), attempts: Number(row.attempts),
      ...(row.last_error ? explainStoredEmailError(row.last_error) : { code: 'pending', hint: 'Отправка ещё не подтверждена.' }) })),
  };
}

export async function recoverOrderDelivery(orderPublicId: string, baseUrl: string) {
  const sql = db();
  const [order] = await sql`SELECT id,public_id,event_slug FROM orders WHERE public_id=${orderPublicId} AND status='paid'`;
  if (!order) return false;
  if (!String(order.public_id).startsWith('AGY-GIFT-')) {
    if (!await retryOrderTicketDelivery(orderPublicId, baseUrl)) return false;
  } else {
    // Gifts retain their personal text, frozen payload and original provider key.
    const [ready] = await sql`SELECT to_regclass('public.personal_ticket_grants') IS NOT NULL AS ready`;
    if (!ready?.ready) return false;
    const [grant] = await sql`SELECT g.campaign_id FROM personal_ticket_grants g JOIN tickets t ON t.id=g.ticket_id WHERE t.order_id=${order.id} LIMIT 1`;
    const event = await getEventServer(String(order.event_slug));
    if (!grant || !event) return false;
    const result = await deliverPersonalBatch(String(grant.campaign_id), event, baseUrl, String(order.id));
    if (result.failed) return false;
  }
  const [remaining] = await sql`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE d.id IS NULL OR d.status<>'sent')::int AS pending
    FROM tickets t LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
    WHERE t.order_id=${order.id} AND t.status IN ('valid','used')`;
  return Number(remaining?.total) > 0 && Number(remaining?.pending) === 0;
}

// The existing paid orders + ticket_deliveries are the durable backlog. This
// endpoint never creates an order, payment, refund or another ticket.
export async function recoverTicketDeliveries(baseUrl: string) {
  const orders = await db()`SELECT o.public_id FROM orders o JOIN tickets t ON t.order_id=o.id
    LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
    WHERE o.status='paid' AND t.status IN ('valid','used') AND (d.id IS NULL OR d.status<>'sent')
      AND coalesce(d.last_error,'') NOT LIKE '[email:idempotency_expired%'
      AND coalesce(d.last_error,'') NOT LIKE '[email:invalid_idempotent_request%'
    GROUP BY o.id,o.public_id,o.paid_at ORDER BY coalesce(min(d.attempts),0),o.paid_at LIMIT 5`;
  const started = Date.now();
  let checked = 0, completed = 0, failed = 0;
  for (const order of orders) {
    if (Date.now() - started > 45000) break;
    checked++;
    try { if (await recoverOrderDelivery(String(order.public_id), baseUrl)) completed++; else failed++; }
    catch { failed++; }
  }
  return { checked, completed, failed };
}
