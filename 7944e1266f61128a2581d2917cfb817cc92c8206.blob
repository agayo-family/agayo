import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';

export const PERSONAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS personal_ticket_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_slug text NOT NULL,
  category_id text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
  levels jsonb NOT NULL, recipients jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS personal_ticket_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES personal_ticket_campaigns(id),
  user_id uuid NOT NULL REFERENCES users(id), ticket_id uuid NOT NULL UNIQUE REFERENCES tickets(id),
  delivery_claim_until timestamptz, email_payload jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS personal_ticket_campaigns_event_idx ON personal_ticket_campaigns(event_slug);
CREATE INDEX IF NOT EXISTS personal_ticket_grants_user_idx ON personal_ticket_grants(user_id,created_at DESC);
`;

const identifier = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
export class PersonalTicketError extends Error {}
export async function personalSchemaReady(sql: postgres.Sql) {
  const [row] = await sql`SELECT to_regclass('public.personal_ticket_grants') IS NOT NULL AS ready`;
  return Boolean(row?.ready);
}

export async function savePersonalCampaign(sql: postgres.Sql, input: { actorId: string; eventSlug: string; categoryId: string; title: string; description: string; levels: string[] }) {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(714206013)`;
    await tx.unsafe(PERSONAL_SCHEMA_SQL);
    const recipients = await tx`SELECT id FROM users WHERE email IS NOT NULL AND email <> ''
      AND loyalty_level IN (SELECT jsonb_array_elements_text(${JSON.stringify(input.levels)}::jsonb)) ORDER BY id LIMIT 5000`;
    if (!recipients.length) throw new PersonalTicketError('У выбранных уровней нет получателей с email');
    const [campaign] = await tx`INSERT INTO personal_ticket_campaigns(event_slug,category_id,title,description,levels,recipients,created_by)
      VALUES(${input.eventSlug},${input.categoryId},${input.title},${input.description},${JSON.stringify(input.levels)}::jsonb,${JSON.stringify(recipients.map(row => String(row.id)))}::jsonb,${input.actorId}) RETURNING *`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${input.actorId},'personal_ticket.prepare','campaign',${campaign.id},${JSON.stringify({ recipients: recipients.length, eventSlug: input.eventSlug })}::jsonb)`;
    return campaign;
  });
}

export async function issuePersonalBatch(sql: postgres.Sql, campaignId: string, actorId: string, size = 10) {
  return sql.begin(async tx => {
    const [campaign] = await tx`SELECT * FROM personal_ticket_campaigns WHERE id=${campaignId} FOR UPDATE`;
    if (!campaign) throw new PersonalTicketError('Выпуск не найден');
    const [category] = await tx`SELECT c.id,c.inventory,c.name,e.status,e.starts_at,e.ends_at,e.ticket_mode FROM event_ticket_categories c JOIN events e ON e.id=c.event_id
      WHERE e.slug=${campaign.event_slug} AND c.category_key=${campaign.category_id} FOR UPDATE OF c`;
    if (!category || category.status !== 'published' || Date.parse(String(category.ends_at || category.starts_at)) <= Date.now()) throw new PersonalTicketError('Мероприятие недоступно для выдачи');
    if (category.ticket_mode === 'seats') throw new PersonalTicketError('Для нумерованных мест сначала требуется схема распределения мест');
    const recipients = await tx`SELECT u.id,u.email,u.phone,u.display_name FROM users u
      WHERE u.id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(campaign.recipients)}::jsonb))
      AND NOT EXISTS (SELECT 1 FROM personal_ticket_grants g WHERE g.campaign_id=${campaign.id} AND g.user_id=u.id)
      ORDER BY u.id LIMIT ${Math.max(1, Math.min(10, size))}`;
    if (category.inventory != null) {
      const [counts] = await tx`SELECT
        (SELECT count(*)::int FROM tickets WHERE event_slug=${campaign.event_slug} AND category_id=${campaign.category_id} AND status IN ('valid','used')) AS sold,
        (SELECT coalesce(sum(quantity),0)::int FROM ticket_inventory_reservations WHERE event_slug=${campaign.event_slug} AND category_id=${campaign.category_id} AND consumed_at IS NULL AND released_at IS NULL) AS reserved`;
      if (Number(category.inventory) - Number(counts.sold) - Number(counts.reserved) < recipients.length) throw new PersonalTicketError('Недостаточно билетов этой категории. Уже выданные билеты сохранены; увеличь лимит или выбери другой выпуск');
    }
    for (const user of recipients) {
      const owner = String(user.display_name || user.email || 'Гость AGAYO').slice(0, 120);
      const [order] = await tx`INSERT INTO orders(public_id,user_id,event_slug,email,phone,owner_name,status,subtotal,discount,total,paid_at)
        VALUES(${identifier('AGY-GIFT')},${user.id},${campaign.event_slug},${user.email},${user.phone},${owner},'paid',0,0,0,now()) RETURNING id`;
      await tx`INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES(${order.id},${campaign.category_id},${category.name},0,1)`;
      const [ticket] = await tx`INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,zone)
        VALUES(${identifier('AGY-PERSONAL')},${randomBytes(32).toString('base64url')},${order.id},${user.id},${campaign.event_slug},${owner},${campaign.category_id},${category.name},${category.ticket_mode === 'zones' ? category.name : null}) RETURNING id`;
      await tx`INSERT INTO personal_ticket_grants(campaign_id,user_id,ticket_id) VALUES(${campaign.id},${user.id},${ticket.id})`;
      await tx`INSERT INTO ticket_deliveries(ticket_id,channel,destination) VALUES(${ticket.id},'email',${user.email})`;
    }
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorId},'personal_ticket.issue','campaign',${campaign.id},${JSON.stringify({ issued: recipients.length })}::jsonb)`;
    return { issued: recipients.length };
  });
}

export async function personalTicketDescriptions(sql: postgres.Sql, ticketIds: string[]) {
  if (!ticketIds.length || !await personalSchemaReady(sql)) return new Map<string, { title: string; description: string }>();
  const rows = await sql`SELECT t.public_id,c.title,c.description FROM personal_ticket_grants g
    JOIN personal_ticket_campaigns c ON c.id=g.campaign_id JOIN tickets t ON t.id=g.ticket_id
    WHERE t.public_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ticketIds)}::jsonb))`;
  return new Map(rows.map(row => [String(row.public_id), { title: String(row.title), description: String(row.description) }]));
}
