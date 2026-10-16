import { randomUUID } from 'node:crypto';

export const ADMIN_REFUND_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  ticket_id uuid UNIQUE REFERENCES tickets(id), actor_id uuid NOT NULL REFERENCES users(id),
  request_payload jsonb NOT NULL, reason text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','pending','succeeded','canceled')),
  provider_refund_id text UNIQUE, first_attempt_at timestamptz, claim_until timestamptz,
  last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_refund_requests_order_once ON admin_refund_requests(order_id) WHERE ticket_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admin_refund_requests_order_active ON admin_refund_requests(order_id) WHERE status IN ('unknown','pending');
`;
export class AdminRefundError extends Error {}
export type RefundPayload = { paymentId: string; amount: number; percent: number; partial: boolean; description: string };

export async function ensureAdminRefundSchema(sql: any) {
  await sql.begin(async (tx: any) => {
    await tx`SELECT pg_advisory_xact_lock(714206015)`;
    await tx.unsafe(ADMIN_REFUND_SCHEMA_SQL);
  });
}

export async function prepareAdminRefund(sql: any, input: {
  orderId: string; ticketId: string | null; actorId: string; reason: string; payload: RefundPayload;
}) {
  await ensureAdminRefundSchema(sql);
  return sql.begin(async (tx: any) => {
    const [order] = await tx`SELECT id,status FROM orders WHERE id=${input.orderId} FOR UPDATE`;
    if (!order) throw new AdminRefundError('Заказ не найден');
    const [existing] = await tx`SELECT * FROM admin_refund_requests WHERE order_id=${input.orderId}
      AND ((${input.ticketId}::uuid IS NULL AND ticket_id IS NULL) OR ticket_id=${input.ticketId}) LIMIT 1 FOR UPDATE`;
    // Resuming always uses the first payload, even across date/price changes.
    if (existing) return existing;
    if (order.status !== 'paid') throw new AdminRefundError('Возврат доступен только для оплаченного заказа');
    const [active] = await tx`SELECT id FROM admin_refund_requests WHERE order_id=${input.orderId} AND status IN ('unknown','pending') LIMIT 1`;
    if (active) throw new AdminRefundError('По заказу уже сверяется другой возврат. Сначала проверь его результат');
    if (input.ticketId) {
      const [ticket] = await tx`SELECT status FROM tickets WHERE id=${input.ticketId} AND order_id=${input.orderId} FOR UPDATE`;
      if (!ticket || !['valid', 'cancelled'].includes(String(ticket.status))) throw new AdminRefundError('Возврат билета доступен до его использования');
      const [legacy] = await tx`SELECT ticket_id FROM ticket_refunds WHERE ticket_id=${input.ticketId} LIMIT 1`;
      if (legacy) throw new AdminRefundError('По билету уже запрашивали возврат. Сначала сверь его существующий результат');
    }
    const id = randomUUID();
    const [request] = await tx`INSERT INTO admin_refund_requests(id,order_id,ticket_id,actor_id,request_payload,reason)
      VALUES(${id},${input.orderId},${input.ticketId},${input.actorId},${JSON.stringify(input.payload)}::text::jsonb,${input.reason}) RETURNING *`;
    if (input.ticketId) await tx`INSERT INTO ticket_refunds(ticket_id,order_id,refund_percent,amount,status,reason,created_by)
      VALUES(${input.ticketId},${input.orderId},${input.payload.percent},${input.payload.amount},'pending',${input.reason},${input.actorId})`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${input.actorId},'refund.prepare','order',${input.orderId},
        ${JSON.stringify({ requestId: id, ticketId: input.ticketId, amount: input.payload.amount, percent: input.payload.percent, reason: input.reason })}::text::jsonb)`;
    return request;
  });
}

export async function findAdminRefund(sql: any, orderId: string, ticketId: string | null) {
  const [schema] = await sql`SELECT to_regclass('public.admin_refund_requests') IS NOT NULL AS ready`;
  if (!schema?.ready) return null;
  const [row] = await sql`SELECT * FROM admin_refund_requests WHERE order_id=${orderId}
    AND ((${ticketId}::uuid IS NULL AND ticket_id IS NULL) OR ticket_id=${ticketId}) LIMIT 1`;
  return row || null;
}

export async function runAdminRefund(sql: any, request: any, provider: {
  create: (payload: RefundPayload & { idempotenceKey: string }) => Promise<{ id: string; status: string }>;
  sync: (id: string) => Promise<{ state: string }>;
}) {
  const claim = await sql.begin(async (tx: any) => {
    const [current] = await tx`SELECT * FROM admin_refund_requests WHERE id=${request.id} FOR UPDATE`;
    if (['succeeded','canceled'].includes(current.status)) return { current, execute: false };
    if (current.claim_until && Date.parse(String(current.claim_until)) > Date.now()) return { current, execute: false };
    // YooKassa keeps idempotency for 24 hours. Never re-create an unknown
    // operation after that window: a human must reconcile it with the provider.
    if (!current.provider_refund_id && current.first_attempt_at
      && Date.now() - Date.parse(String(current.first_attempt_at)) >= 23 * 60 * 60 * 1000) {
      throw new AdminRefundError('Результат возврата неизвестен более 23 часов. Нужна сверка с ЮKassa; новый возврат не отправлен');
    }
    await tx`UPDATE admin_refund_requests SET claim_until=now()+interval '2 minutes',
      first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() WHERE id=${request.id}`;
    return { current, execute: true };
  });
  if (!claim.execute) return { state: claim.current.status, amount: Number(claim.current.request_payload.amount),
    message: claim.current.status === 'succeeded' ? 'Возврат уже выполнен и сохранён в AGAYO.' : claim.current.status === 'canceled'
      ? 'ЮKassa подтвердила отмену возврата. Деньги не возвращались; билет сохраняет прежний статус. Перед новым возвратом проверь причину отмены.' : 'Возврат уже обрабатывается. Повтори проверку позже.' };
  let providerId = claim.current.provider_refund_id;
  const payload: RefundPayload = claim.current.request_payload;
  try {
    if (!providerId) {
      const refund = await provider.create({ ...payload, idempotenceKey: `AGAYO-REFUND-${request.id}` });
      if (!refund?.id) throw new Error('Refund result unknown');
      providerId = String(refund.id);
      await sql.begin(async (tx: any) => {
        await tx`SELECT id FROM orders WHERE id=${request.order_id} FOR UPDATE`;
        await tx`UPDATE admin_refund_requests SET provider_refund_id=${providerId},
          status=CASE WHEN status IN ('succeeded','canceled') THEN status ELSE 'pending' END,updated_at=now() WHERE id=${request.id}`;
        if (request.ticket_id) await tx`UPDATE ticket_refunds SET yookassa_refund_id=${providerId},updated_at=now()
          WHERE ticket_id=${request.ticket_id} AND status='pending'`;
      });
    }
    const synced = await provider.sync(String(providerId));
    let succeeded = ['refunded', 'partial_refund'].includes(synced.state);
    let canceled = synced.state === 'canceled';
    await sql`UPDATE admin_refund_requests SET status=${succeeded ? 'succeeded' : canceled ? 'canceled' : 'pending'},last_error=NULL,updated_at=now()
      WHERE id=${request.id} AND status NOT IN ('succeeded','canceled')`;
    const [latest] = await sql`SELECT status FROM admin_refund_requests WHERE id=${request.id}`;
    succeeded = latest?.status === 'succeeded'; canceled = latest?.status === 'canceled';
    return { state: succeeded ? (['refunded','partial_refund'].includes(synced.state) ? synced.state : request.ticket_id ? 'partial_refund' : 'refunded') : canceled ? 'canceled' : 'pending', amount: payload.amount,
      message: succeeded ? `Возврат ${payload.amount.toFixed(2)} ₽ подтверждён. Возвращённые билеты недействительны.`
        : canceled ? 'ЮKassa отменила возврат. Деньги не возвращались; прежний статус билета сохранён. Проверь причину отмены.'
          : 'Возврат создан в ЮKassa и ожидает подтверждения. Проверь его статус позже.' };
  } catch (error) {
    // A network or DB error is not proof that no money moved. Keep the exact
    // request and key for reconciliation; never change it to a fresh attempt.
    const [latest] = await sql`SELECT status FROM admin_refund_requests WHERE id=${request.id}`;
    if (latest?.status === 'succeeded' || latest?.status === 'canceled') return {
      state: latest.status === 'canceled' ? 'canceled' : request.ticket_id ? 'partial_refund' : 'refunded', amount: payload.amount,
      message: latest.status === 'succeeded' ? 'Возврат уже подтверждён и сохранён в AGAYO.' : 'ЮKassa подтвердила отмену возврата. Деньги не возвращались; прежний статус билета сохранён.',
    };
    await sql`UPDATE admin_refund_requests SET last_error='Требуется повторная сверка результата',updated_at=now()
      WHERE id=${request.id} AND status NOT IN ('succeeded','canceled')`;
    console.warn('Refund requires reconciliation', { requestId: request.id, knownProviderId: Boolean(providerId) });
    return { state: 'unknown', amount: payload.amount,
      message: 'Ответ возврата не подтверждён. Проход приостановлен; нажми «Проверить возврат». Новый возврат и новая сумма не создаются.' };
  } finally {
    await sql`UPDATE admin_refund_requests SET claim_until=NULL WHERE id=${request.id}`;
  }
}
