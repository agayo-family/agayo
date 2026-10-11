import { NextResponse } from 'next/server';
import { AdminAccessError, canAccessEvent, requireAdminPermission } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import { getEventServer } from '@/lib/server/events';
import { getLoyaltyLevels } from '@/lib/server/loyalty';
import { personalSchemaReady, savePersonalCampaign, issuePersonalBatch, PersonalTicketError } from '@/lib/server/personal-ticket-store';
import { deliverPersonalBatch } from '@/lib/server/personal-ticket-delivery';
import { getEventCatalogBadge } from '@/lib/events';
import { siteOrigin } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
async function campaigns() {
  const sql = db();
  if (!await personalSchemaReady(sql)) return [];
  return sql`SELECT c.id,c.event_slug,c.category_id,c.title,c.description,c.levels,c.version,c.created_at,
    jsonb_array_length(c.recipients)::int AS recipients,count(g.id)::int AS issued,
    count(d.id) FILTER (WHERE d.status='sent')::int AS sent,
    count(d.id) FILTER (WHERE d.status='failed')::int AS failed
    FROM personal_ticket_campaigns c LEFT JOIN personal_ticket_grants g ON g.campaign_id=c.id
    LEFT JOIN ticket_deliveries d ON d.ticket_id=g.ticket_id AND d.channel='email'
    GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`;
}
function failure(error: unknown) {
  const status = error instanceof AdminAccessError ? error.status : error instanceof PersonalTicketError ? 409 : 500;
  if (status === 500) console.error('Personal ticket operation failed', error);
  return NextResponse.json({ error: status === 500 ? 'Не удалось выполнить действие. Выпуск можно продолжить без повторной выдачи билетов.' : (error as Error).message }, { status });
}
export async function GET(request: Request) {
  try {
    const actor = await requireAdminPermission('manage_loyalty');
    const slug = new URL(request.url).searchParams.get('event');
    if (slug) {
      await requireAdminPermission('manage_ticket_inventory', slug);
      const event = await getEventServer(slug);
      return NextResponse.json({ categories: event?.tickets.map(ticket => ({ id: ticket.id, name: ticket.name })) || [] });
    }
    return NextResponse.json({ campaigns: (await campaigns()).filter(row => canAccessEvent(actor, String(row.event_slug))) });
  }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    await requireAdminPermission('manage_loyalty');
    const body = await request.json();
    const sql = db();
    if (body.action === 'create') {
      const slug = clean(body.eventSlug, 200);
      const actor = await requireAdminPermission('manage_ticket_inventory', slug);
      const event = await getEventServer(slug);
      const categoryId = clean(body.categoryId, 100);
      const title = clean(body.title, 80), description = clean(body.description, 600);
      const levels = Array.isArray(body.levels) ? [...new Set(body.levels.map((value: unknown) => clean(value, 32)))].slice(0, 10) as string[] : [];
      const known = new Set((await getLoyaltyLevels()).map(level => level.levelKey));
      if (!event || event.status !== 'published' || event.ticketMode === 'seats' || getEventCatalogBadge(event) === 'archive' || !event.tickets.some(ticket => ticket.id === categoryId) || !title || !description || !levels.length || levels.some(key => !known.has(key))) return NextResponse.json({ error: 'Выбери актуальное событие без нумерованных мест, категорию, уровни и заполни название с описанием' }, { status: 400 });
      const campaign = await savePersonalCampaign(sql, { actorId: actor.userId, eventSlug: slug, categoryId, title, description, levels });
      return NextResponse.json({ ok: true, campaign, campaigns: (await campaigns()).filter(row => canAccessEvent(actor, String(row.event_slug))) });
    }
    const id = clean(body.id, 36);
    if (!UUID.test(id) || !await personalSchemaReady(sql)) return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 });
    const [campaign] = await sql`SELECT * FROM personal_ticket_campaigns WHERE id=${id}`;
    if (!campaign) return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 });
    const actor = await requireAdminPermission('manage_ticket_inventory', String(campaign.event_slug));
    if (body.action === 'edit') {
      const title = clean(body.title, 80), description = clean(body.description, 600);
      if (!title || !description || !Number.isInteger(body.version)) return NextResponse.json({ error: 'Заполни название и описание' }, { status: 400 });
      await sql.begin(async tx => {
        const rows = await tx`UPDATE personal_ticket_campaigns SET title=${title},description=${description},version=version+1,updated_at=now() WHERE id=${id} AND version=${body.version} RETURNING id`;
        if (!rows.length) throw new PersonalTicketError('Описание уже изменилось. Обнови список и повтори');
        await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details) VALUES(${actor.userId},'personal_ticket.edit','campaign',${id},'{}'::jsonb)`;
      });
    } else if (body.action === 'issue' || body.action === 'retry') {
      const event = await getEventServer(String(campaign.event_slug));
      if (!event) throw new PersonalTicketError('Событие не найдено');
      if (!process.env.EMAIL_PROVIDER_API_KEY || !process.env.EMAIL_FROM) throw new PersonalTicketError('Сначала подключи email-доставку в настройках сайта');
      if (body.action === 'issue') await issuePersonalBatch(sql, id, actor.userId);
      const delivery = await deliverPersonalBatch(id, event, siteOrigin());
      return NextResponse.json({ ok: true, delivery, campaigns: (await campaigns()).filter(row => canAccessEvent(actor, String(row.event_slug))) });
    } else return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
    return NextResponse.json({ ok: true, campaigns: (await campaigns()).filter(row => canAccessEvent(actor, String(row.event_slug))) });
  } catch (error) { return failure(error); }
}
