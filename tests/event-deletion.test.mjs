import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';

const deletion = await loadTs('../lib/server/event-deletion.ts');
const personal = await loadTs('../lib/server/personal-ticket-store.ts');
const lifecycle = await loadTs('../lib/events.ts');
const eventId = async pg => (await pg.query("SELECT id FROM events WHERE slug='test-halloween'")).rows[0].id;

class AdminAccessError extends Error { constructor(message = 'Недостаточно прав') { super(message); this.status = 403; } }
async function api(sql, requireAdminPermission, invalidated = []) {
  return loadTsx('../app/api/admin/events/[id]/route.ts', {
    '@/lib/server/db': { db: () => sql },
    '@/lib/server/admin': { AdminAccessError, requireAdminPermission },
    '@/lib/server/event-deletion': deletion,
    '@/lib/server/public-content': { invalidatePublicContent: kind => invalidated.push(kind) },
    'next/cache': { revalidatePath: path => invalidated.push(path) },
  });
}
const request = (slug = 'test-halloween') => new Request('https://example.test/api/admin/events/fixture', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmSlug: slug }),
});

test('deletion requires management permission, event scope and explicit confirmation before changing data', async () => {
  const denied = await api(null, async () => { throw new AdminAccessError(); });
  assert.equal((await denied.DELETE(request(), { params: Promise.resolve({ id: actor }) })).status, 403);
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    const calls = [];
    const scoped = await api(sql, async (permission, slug) => {
      calls.push([permission, slug]);
      if (slug) throw new AdminAccessError('Нет доступа к этому мероприятию');
      return { userId: actor };
    });
    assert.equal((await scoped.DELETE(request(), { params: Promise.resolve({ id }) })).status, 403);
    assert.deepEqual(calls, [['manage_events', undefined], ['manage_events', 'test-halloween']]);
    const allowed = await api(sql, async () => ({ userId: actor }));
    assert.equal((await allowed.DELETE(request('different-event'), { params: Promise.resolve({ id }) })).status, 400);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM events')).rows[0].n, 1);
  } finally { await pg.close(); }
});

test('deletion removes only an unused event, categories, program and stale event access; commits audit and expires public pages', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    await pg.exec("CREATE TABLE admin_event_access(event_slug text); INSERT INTO admin_event_access VALUES('test-halloween'),('another-event');");
    await pg.query('INSERT INTO event_program_items(event_id,time_label,title) VALUES($1,$2,$3)', [id, '18:00', 'Начало']);
    const invalidated = [];
    const { DELETE } = await api(sql, async () => ({ userId: actor }), invalidated);
    assert.equal((await DELETE(request(), { params: Promise.resolve({ id }) })).status, 200);
    for (const table of ['events', 'event_ticket_categories', 'event_program_items']) {
      assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
    }
    assert.deepEqual((await pg.query('SELECT event_slug FROM admin_event_access')).rows, [{ event_slug: 'another-event' }]);
    assert.deepEqual((await pg.query("SELECT action,details->>'slug' AS slug FROM admin_audit_log")).rows, [{ action: 'event.delete', slug: 'test-halloween' }]);
    assert.deepEqual(invalidated, ['events', '/events/test-halloween', '/events/test-halloween/rules']);
  } finally { await pg.close(); }
});

test('every order status protects the event and financial history, including cancelled purchases and zero-price gifts', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    for (const status of ['pending', 'paid', 'cancelled', 'refunded', 'expired']) {
      await pg.query('INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES($1,$2,$3,$4,$5,$6,0,0)', [status, actor, 'test-halloween', 'owner@example.test', 'Гость', status]);
      await assert.rejects(deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween'), error => error.status === 409 && /заказы или билеты/.test(error.message));
    }
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 5);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM events')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM event_ticket_categories')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('related photos, reviews, promos and prepared personal campaigns prevent orphaning their content', async () => {
  const { pg, sql } = await fixture({ guests: 1 });
  try {
    const id = await eventId(pg);
    for (const [table, statement] of [
      ['media_photos', "INSERT INTO media_photos(event_slug,url) VALUES('test-halloween','https://example.test/photo.jpg')"],
      ['media_reviews', "INSERT INTO media_reviews(event_slug,author,body) VALUES('test-halloween','Гость','Отзыв')"],
      ['promo_codes', "INSERT INTO promo_codes(event_slug,code,discount_type,discount_value) VALUES('test-halloween','GUEST','fixed',10)"],
    ]) {
      await pg.exec(statement);
      await assert.rejects(deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween'), error => error.status === 409 && /связанные материалы/.test(error.message));
      assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE event_slug='test-halloween'`)).rows[0].n, 1);
      await pg.exec(`DELETE FROM ${table} WHERE event_slug='test-halloween'`);
    }
    await personal.savePersonalCampaign(sql, { actorId: actor, eventSlug: 'test-halloween', categoryId: 'standard', title: 'Для своих', description: 'Приглашение', levels: ['GOLD'] });
    await assert.rejects(deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween'), error => error.status === 409 && /персональные выпуски/.test(error.message));
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM personal_ticket_campaigns')).rows[0].n, 1);
  } finally { await pg.close(); }
});

test('audit failure rolls deletion back, and a committed deletion is not revived by admin seeding', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  const configured = process.env.DATABASE_URL;
  try {
    const id = await eventId(pg);
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_deletion CHECK(action <> 'event.delete') NOT VALID");
    await assert.rejects(deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween'));
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM event_ticket_categories')).rows[0].n, 1);
    await pg.exec('ALTER TABLE admin_audit_log DROP CONSTRAINT reject_deletion');
    await deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween');
    const seeded = { ...lifecycle.events[0], slug: 'test-halloween' };
    const { ensureSeedEvents } = await loadTsx('../lib/server/seed-events.ts', {
      '@/lib/events': { events: [seeded, { ...seeded, slug: 'fresh-built-in' }] }, './db': { db: () => sql }, './event-deletion': deletion,
    });
    process.env.DATABASE_URL = 'isolated-fixture';
    await ensureSeedEvents();
    await ensureSeedEvents();
    assert.deepEqual((await pg.query('SELECT slug FROM events')).rows, [{ slug: 'fresh-built-in' }]);
  } finally {
    if (configured === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = configured;
    await pg.close();
  }
});

test('personal preparation after deletion rechecks the locked event and creates no campaign', async () => {
  const { pg, sql } = await fixture({ guests: 1 });
  try {
    await deletion.deleteUnusedEvent(sql, await eventId(pg), actor, 'test-halloween');
    await assert.rejects(personal.savePersonalCampaign(sql, { actorId: actor, eventSlug: 'test-halloween', categoryId: 'standard', title: 'Для своих', description: 'Приглашение', levels: ['GOLD'] }), personal.PersonalTicketError);
    assert.equal((await pg.query("SELECT to_regclass('public.personal_ticket_campaigns') AS name")).rows[0].name, null);
  } finally { await pg.close(); }
});

test('event list exposes deletion only to event managers within their event scope', async () => {
  const { default: Manager } = await loadTsx('../components/AdminEventsManager.tsx', {
    '@/lib/client/upload': {}, '@/lib/event-palette': {}, '@/lib/legal': { DEFAULT_EVENT_RULES: '' },
  });
  const events = [{ id: actor, slug: 'allowed', title: 'Событие', starts_at: '2080-11-01', ends_at: null, status: 'draft', sales_state: 'closed', ticket_mode: 'zones' }];
  const html = access => renderToStaticMarkup(createElement(Manager, { access, previewMode: false, events, setEvents: () => {} }));
  const base = { role: 'organizer', permissions: ['manage_events'], allEvents: false, eventSlugs: ['allowed'] };
  assert.ok(html(base).includes('Удалить мероприятие'));
  assert.equal(html({ ...base, permissions: [] }).includes('Удалить мероприятие'), false);
  assert.equal(html({ ...base, eventSlugs: ['another-event'] }).includes('Удалить мероприятие'), false);
});
