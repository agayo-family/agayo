import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminPermission } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import { invalidatePublicContent } from '@/lib/server/public-content';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const slug = String(body.eventSlug || '').trim().slice(0, 200);
    const actor = await requireAdminPermission('manage_events', slug);
    await requireAdminPermission('manage_ticket_inventory', slug);
    const name = String(body.name || '').trim().slice(0, 80);
    const note = String(body.note || '').trim().slice(0, 600);
    const price = Number(body.price), inventory = body.inventory === '' || body.inventory == null ? null : Number(body.inventory);
    const palette = [body.primary, body.secondary, body.accent].map(value => String(value || ''));
    if (!name || !Number.isSafeInteger(price) || price < 1 || price > 1_000_000
      || (inventory != null && (!Number.isSafeInteger(inventory) || inventory < 1 || inventory > 1_000_000))
      || palette.some(value => !/^#[0-9a-f]{6}$/i.test(value))) {
      return NextResponse.json({ error: 'Заполни название, цену от 1 ₽, корректный лимит и цвета. При бесплатной выдаче цена категории не списывается.' }, { status: 400 });
    }
    const category = await db().begin(async tx => {
      const [event] = await tx`SELECT id,status FROM events e WHERE slug=${slug}
        AND (to_jsonb(e)->>'deleted_at') IS NULL FOR UPDATE`;
      if (!event || event.status !== 'published') throw new AdminAccessError('Событие недоступно', 409);
      const [count] = await tx`SELECT count(*)::int AS n FROM event_ticket_categories WHERE event_id=${event.id}`;
      if (Number(count.n) >= 30) throw new AdminAccessError('В событии уже 30 категорий. Отредактируй существующую в управлении событием', 409);
      const key = `invite-${randomBytes(6).toString('hex')}`;
      await tx`INSERT INTO event_ticket_categories(event_id,category_key,name,price,note,inventory,theme_primary,theme_secondary,theme_accent,sort_order)
        VALUES(${event.id},${key},${name},${price},${note},${inventory},${palette[0]},${palette[1]},${palette[2]},${Number(count.n)})`;
      await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
        VALUES(${actor.userId},'ticket_category.create','event',${String(event.id)},
          ${JSON.stringify({ categoryId: key, name, price, inventory })}::text::jsonb)`;
      return { id: key, name };
    });
    invalidatePublicContent('events');
    return NextResponse.json({ ok: true, category });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    if (status === 500) console.error('Ticket category creation failed', error);
    return NextResponse.json({ error: status === 500 ? 'Не удалось сохранить категорию. Обнови список перед повторной попыткой.' : (error as Error).message }, { status });
  }
}
