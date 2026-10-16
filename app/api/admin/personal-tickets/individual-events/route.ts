import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminPermission } from '@/lib/server/admin';
import { db } from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const actor = await requireAdminPermission('manage_ticket_inventory');
    const rows = await db()`SELECT e.slug,e.title,c.category_key,c.name
      FROM events e JOIN event_ticket_categories c ON c.event_id=e.id
      WHERE e.status='published' AND e.ticket_mode<>'seats' AND coalesce(e.ends_at,e.starts_at)>now()
        AND (to_jsonb(e)->>'deleted_at') IS NULL
        AND (${actor.role === 'owner' || actor.allEvents} OR e.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(actor.eventSlugs)}::text::jsonb)))
      ORDER BY e.starts_at,c.sort_order,c.id LIMIT 500`;
    const events = new Map<string, { slug: string; title: string; tickets: { id: string; name: string }[] }>();
    for (const row of rows) {
      if (!events.has(String(row.slug))) events.set(String(row.slug), { slug: String(row.slug), title: String(row.title), tickets: [] });
      events.get(String(row.slug))!.tickets.push({ id: String(row.category_key), name: String(row.name) });
    }
    return NextResponse.json({ events: [...events.values()] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: status === 500 ? 'Не удалось загрузить события для выдачи' : (error as Error).message }, { status });
  }
}
