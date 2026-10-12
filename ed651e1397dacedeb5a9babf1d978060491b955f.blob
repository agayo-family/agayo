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
    // Checkout and personal preparation take the same event row lock before
    // creating history. A checkout that waits for deletion must recheck it.
    const [event] = await tx`SELECT id,slug,title FROM events WHERE id=${id} FOR UPDATE`;
    if (!event) throw new EventDeletionError('Мероприятие не найдено', 404);
    if (confirmedSlug !== event.slug) throw new EventDeletionError('Подтверди удаление выбранного мероприятия', 400);

    const [history] = await tx`SELECT
      EXISTS (SELECT 1 FROM orders WHERE event_slug=${event.slug}) AS orders,
      EXISTS (SELECT 1 FROM tickets WHERE event_slug=${event.slug}) AS tickets`;
    if (history.orders || history.tickets) {
      throw new EventDeletionError('У мероприятия есть заказы или билеты. Удаление запрещено, чтобы сохранить историю. Сними его с публикации и закрой продажи.');
    }
    const [schema] = await tx`SELECT
      to_regclass('public.personal_ticket_campaigns') IS NOT NULL AS personal,
      to_regclass('public.admin_event_access') IS NOT NULL AS access`;
    if (schema.personal) {
      const [campaign] = await tx`SELECT id FROM personal_ticket_campaigns WHERE event_slug=${event.slug} LIMIT 1`;
      if (campaign) throw new EventDeletionError('У мероприятия есть персональные выпуски билетов. Сними событие с публикации и закрой продажи, чтобы сохранить историю приглашений.');
    }
    const [content] = await tx`SELECT
      EXISTS (SELECT 1 FROM media_photos WHERE event_slug=${event.slug}) AS photos,
      EXISTS (SELECT 1 FROM media_reviews WHERE event_slug=${event.slug}) AS reviews,
      EXISTS (SELECT 1 FROM promo_codes WHERE event_slug=${event.slug}) AS promos`;
    if (content.photos || content.reviews || content.promos) {
      throw new EventDeletionError('У мероприятия есть фото, отзывы или промокоды. Сначала перенеси или удали связанные материалы либо сними событие с публикации.');
    }
    if (schema.access) await tx`DELETE FROM admin_event_access WHERE event_slug=${event.slug}`;
    await tx`DELETE FROM events WHERE id=${id}`;
    // Keep the audit and deletion atomic. The slug also prevents seed revival.
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorId},'event.delete','event',${id},${JSON.stringify({ slug: event.slug, title: event.title })}::jsonb)`;
    return { id: String(event.id), slug: String(event.slug), title: String(event.title) };
  });
}
