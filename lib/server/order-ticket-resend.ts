import { randomUUID } from 'node:crypto';
import { sendTicketEmail, type TicketEmailInput } from './email';
import { emailErrorMessage, explainStoredEmailError } from './email-transport';
import type { AgayoEvent } from '../events';

type Sql = any;
type Item = { ticketId: string; input: TicketEmailInput };
type Payload = { to: string; items: Item[] };
type Results = Record<string, { status: 'sent' | 'failed'; error?: string; providerId?: string }>;
export class TicketResendError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

// Keep synchronized with db/019_ticket_resend_requests.sql. Initialization is
// restricted to the explicit authenticated POST, never a public read or build.
export const TICKET_RESEND_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ticket_resend_requests (
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES orders(id),actor_id uuid NOT NULL REFERENCES users(id),
 payload jsonb NOT NULL,results jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 claim_token uuid,claim_until timestamptz,first_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_resend_order_created_idx ON ticket_resend_requests(order_id,created_at DESC);
`;

function object<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

export async function prepareOrderResend(sql: Sql, input: { requestId: string; orderId: string; actorId: string; event: AgayoEvent; baseUrl: string }) {
  return sql.begin(async (tx: Sql) => {
    await tx`SELECT pg_advisory_xact_lock(714206019)`;
    await tx.unsafe(TICKET_RESEND_SCHEMA_SQL);
    const [order] = await tx`SELECT * FROM orders WHERE id=${input.orderId} FOR UPDATE`;
    if (!order || order.status !== 'paid') throw new TicketResendError('Повторная отправка доступна для оплаченного заказа');
    const [existing] = await tx`SELECT * FROM ticket_resend_requests WHERE id=${input.requestId} FOR UPDATE`;
    if (existing) {
      if (String(existing.order_id) !== input.orderId || String(existing.actor_id) !== input.actorId) throw new TicketResendError('Запрос отправки относится к другому заказу или сотруднику');
      return existing;
    }
    const [recent] = await tx`SELECT id FROM ticket_resend_requests WHERE order_id=${input.orderId}
      AND (created_at>now()-interval '1 minute' OR claim_until>now()) LIMIT 1`;
    if (recent) throw new TicketResendError('Предыдущая отправка ещё обрабатывается. Повтори проверку через минуту', 429);
    const tickets = await tx`SELECT id,public_id,qr_token,owner_name,category_id,category_name,zone,seat
      FROM tickets WHERE order_id=${order.id} AND status IN ('valid','used') ORDER BY created_at,id`;
    if (!tickets.length) throw new TicketResendError('В заказе нет действующих билетов для повторной отправки');
    if (tickets.length > 50) throw new TicketResendError('Для такого большого заказа нужна отдельная проверка отправки');
    const [personalReady] = await tx`SELECT to_regclass('public.personal_ticket_grants') IS NOT NULL AS ready`;
    const personal = personalReady?.ready ? await tx`SELECT g.ticket_id,g.email_payload,c.title,c.description
      FROM personal_ticket_grants g JOIN personal_ticket_campaigns c ON c.id=g.campaign_id
      JOIN tickets t ON t.id=g.ticket_id WHERE t.order_id=${order.id}` : [];
    const event = input.event;
    const items: Item[] = tickets.map((ticket: any): Item => {
      const gift = personal.find((row: any) => String(row.ticket_id) === String(ticket.id));
      const frozen = gift?.email_payload ? object<Partial<TicketEmailInput>>(gift.email_payload) : {};
      const poster = event.posterImage || event.heroImage;
      return { ticketId: String(ticket.id), input: {
        eventTitle: event.title, eventSlug: event.slug, eventDate: event.dateLabel, eventTime: event.timeLabel,
        eventCity: event.city, eventAge: event.ageLabel, alcoholFree: event.alcoholFree,
        posterUrl: poster ? new URL(poster, input.baseUrl).href : undefined,
        theme: event.tickets.find(category => category.id === String(ticket.category_id))?.theme || event.ticketTheme,
        ...(gift ? { personalTitle: String(gift.title), personalDescription: String(gift.description) } : {}), ...frozen,
        // Identity and QR always come from the purchased row, even for a frozen gift.
        ticketId: String(ticket.public_id), qrToken: String(ticket.qr_token),
        ticketUrl: `${input.baseUrl}/tickets/${encodeURIComponent(String(ticket.qr_token))}`,
        ownerName: String(ticket.owner_name || order.owner_name), categoryName: String(ticket.category_name),
        zone: ticket.zone || null, seat: ticket.seat || null,
        deliveryKey: `AGAYO-RESEND-${input.requestId}-${ticket.id}`,
      } };
    });
    const payload: Payload = { to: String(order.email), items };
    const [request] = await tx`INSERT INTO ticket_resend_requests(id,order_id,actor_id,payload)
      VALUES(${input.requestId},${order.id},${input.actorId},${JSON.stringify(payload)}::text::jsonb) RETURNING *`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${input.actorId},'ticket.resend.prepare','order',${String(order.id)},
      ${JSON.stringify({ requestId: input.requestId, tickets: items.map(item => item.input.ticketId) })}::text::jsonb)`;
    return request;
  });
}

export async function runOrderResend(sql: Sql, requestId: string, actorId: string) {
  const claimToken = randomUUID();
  const claim = await sql.begin(async (tx: Sql) => {
    const [request] = await tx`SELECT * FROM ticket_resend_requests WHERE id=${requestId} FOR UPDATE`;
    if (!request || String(request.actor_id) !== actorId) throw new TicketResendError('Запрос отправки не найден', 404);
    if (request.status === 'sent') return { request, execute: false };
    if (request.claim_until && Date.parse(String(request.claim_until)) > Date.now()) return { request, execute: false };
    if (request.first_attempt_at && Date.now()-Date.parse(String(request.first_attempt_at)) >= 23*3600000) {
      throw new TicketResendError('Результат этой попытки устарел. Сверь письмо в Resend перед новой отправкой');
    }
    await tx`UPDATE ticket_resend_requests SET status='sending',claim_token=${claimToken},claim_until=now()+interval '4 minutes',
      first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() WHERE id=${requestId}`;
    return { request, execute: true };
  });
  if (!claim.execute) return summarize(claim.request);
  const payload = object<Payload>(claim.request.payload);
  const results = object<Results>(claim.request.results);
  const startedAt = Date.now();
  let attempted = 0;
  // Persist each accepted ticket independently. Retrying an interrupted order
  // continues with its remaining tickets and the original provider keys.
  for (const item of payload.items) {
    if (results[item.ticketId]?.status === 'sent') continue;
    // Leave enough time to persist progress before the 180s Function limit.
    // Large historical orders resume under the same request and provider keys.
    if (attempted >= 6 || Date.now() - startedAt >= 100000) break;
    attempted++;
    try {
      const [live] = await sql`SELECT t.status,o.status AS order_status FROM tickets t JOIN orders o ON o.id=t.order_id
        WHERE t.id=${item.ticketId} AND o.id=${claim.request.order_id}`;
      if (live?.order_status !== 'paid' || !['valid','used'].includes(String(live?.status))) throw new TicketResendError('Билет отменён или возвращён');
      const result = await sendTicketEmail(payload.to, item.input, { emailOnly: true });
      results[item.ticketId] = { status: 'sent', ...('providerId' in result ? { providerId: result.providerId } : {}) };
      await sql`INSERT INTO ticket_deliveries(ticket_id,channel,destination,status,attempts,sent_at)
        VALUES(${item.ticketId},'email',${payload.to},'sent',1,now())
        ON CONFLICT(ticket_id,channel) DO UPDATE SET status='sent',attempts=ticket_deliveries.attempts+1,sent_at=now(),last_error=NULL`;
    } catch (error) {
      const message = error instanceof TicketResendError ? error.message : emailErrorMessage(error);
      results[item.ticketId] = { status: 'failed', error: message };
    }
    await sql`UPDATE ticket_resend_requests SET results=${JSON.stringify(results)}::text::jsonb,updated_at=now()
      WHERE id=${requestId} AND claim_token=${claimToken}`;
    // Definitive configuration/quota errors apply to the remaining recipients
    // as well. Keep those items pending and let the same request resume later.
    const reason = results[item.ticketId]?.error;
    if (reason && /\[email:(?:test_domain|unverified_domain|authentication|configuration|daily_quota_exceeded|monthly_quota_exceeded)/.test(reason)) break;
  }
  const sent = payload.items.filter(item => results[item.ticketId]?.status === 'sent').length;
  const status = sent === payload.items.length ? 'sent'
    : Object.values(results).some(result => result.status === 'failed') ? 'failed' : 'pending';
  const [updated] = await sql`UPDATE ticket_resend_requests SET status=${status},claim_token=NULL,claim_until=NULL,
    results=${JSON.stringify(results)}::text::jsonb,updated_at=now() WHERE id=${requestId} AND claim_token=${claimToken} RETURNING *`;
  if (!updated) throw new TicketResendError('Отправка ещё сверяется. Повтори проверку этого же запроса');
  return summarize(updated);
}

function summarize(request: any) {
  const payload = object<Payload>(request.payload), results = object<Results>(request.results);
  const sent = payload.items.filter(item => results[item.ticketId]?.status === 'sent').length;
  const failure = Object.values(results).find(result => result.status === 'failed')?.error;
  const hint = failure ? (failure.includes('[email:') ? explainStoredEmailError(failure).hint : failure) : '';
  return { requestId: String(request.id), status: String(request.status), sent, total: payload.items.length,
    message: request.status === 'sent' ? `Почтовый сервис принял повторную отправку: ${sent} билет(а). Номера и QR сохранены.`
      : request.status === 'sending' ? 'Отправка ещё выполняется. Повтори проверку этой попытки.'
      : `Принято ${sent} из ${payload.items.length}. ${hint || 'Нажми «Проверить повторную отправку», чтобы продолжить.'}` };
}
