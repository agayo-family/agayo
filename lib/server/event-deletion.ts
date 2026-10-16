import type postgres from 'postgres';

// Shared with initial event seeding so opening the admin list cannot recreate
// a built-in event while its deletion is being committed.
export const EVENT_SEED_LOCK = 714206014;

export class EventDeletionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function deleteUnusedEvent(sql: postgres.Sql, id: string, actorId: string, confirmedSlug: string) {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(${EVENT_SEED_LOCK})`;
    // Initialize before taking a row lock: an ACCESS EXCLUSIVE lock upgrade
    // after FOR UPDATE could deadlock with a checkout waiting on that row.
    const [schema] = await tx`SELECT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='public.events'::regclass AND attname='deleted_at' AND NOT attisdropped) AS ready`;
    if (!schema?.ready) await tx`ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
    // Checkout and personal preparation take the same event row lock before
    // creating history. A checkout that waits for deletion must recheck it.
    const [event] = await tx`SELECT e.id,e.slug,e.title,e.status,e.sales_state,
      to_jsonb(e)->>'deleted_at' AS deleted_at FROM events e WHERE e.id=${id} FOR UPDATE`;
    if (!event) throw new EventDeletionError('Мероприятие не найдено', 404);
    if (confirmedSlug !== event.slug) throw new EventDeletionError('Подтверди удаление выбранного мероприятия', 400);

    // Deletion retires the event from management and discovery, while keeping
    // the original page, galleries, issued tickets and financial history.
    // The marker is event data, independent of audit retention. On older
    // deployments an authenticated deletion can initialize this additive column;
    // public reads remain compatible and never execute schema changes.
    if (event.deleted_at) return { id: String(event.id), slug: String(event.slug), title: String(event.title) };
    await tx`UPDATE events SET sales_state='closed',deleted_at=now(),updated_at=now() WHERE id=${id}`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorId},'event.delete','event',${id},${JSON.stringify({ slug: event.slug, title: event.title, mode: 'retired', previousStatus: event.status, previousSalesState: event.sales_state })}::text::jsonb)`;
    return { id: String(event.id), slug: String(event.slug), title: String(event.title) };
  });
}
