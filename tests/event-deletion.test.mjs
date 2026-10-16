import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture as databaseFixture, actor } from './database-fixture.mjs';
import { postgresDriverSql } from './postgres-driver-sql.mjs';
async function fixture(options) { const value = await databaseFixture(options); return { ...value, sql: postgresDriverSql(value.pg) }; }

const deletion = await loadTs('../lib/server/event-deletion.ts');
const personal = await loadTs('../lib/server/personal-ticket-store.ts');
const lifecycle = await loadTs('../lib/events.ts');
const legal = await loadTs('../lib/legal.ts');
const hot = await loadTs('../lib/server/hot-tickets.ts');
const eventId = async pg => (await pg.query("SELECT id FROM events WHERE slug='test-halloween'")).rows[0].id;

class AdminAccessError extends Error { constructor(message = 'Недостаточно прав', status = 403) { super(message); this.status = status; } }
async function api(sql, requireAdminPermission, invalidated = []) {
  return loadTsx('../app/api/admin/events/[id]/route.ts', {
    '@/lib/server/db': { db: () => sql },
    '@/lib/server/admin': { AdminAccessError, requireAdminPermission },
    '@/lib/server/event-deletion': deletion,
    '@/lib/server/hot-tickets': hot,
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

test('deletion durably retires an event without destroying its page, categories, program or event access', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    await pg.exec("CREATE TABLE admin_event_access(event_slug text); INSERT INTO admin_event_access VALUES('test-halloween'),('another-event');");
    await pg.query('INSERT INTO event_program_items(event_id,time_label,title) VALUES($1,$2,$3)', [id, '18:00', 'Начало']);
    const invalidated = [];
    const { DELETE } = await api(sql, async () => ({ userId: actor }), invalidated);
    assert.equal((await DELETE(request(), { params: Promise.resolve({ id }) })).status, 200);
    for (const table of ['events', 'event_ticket_categories', 'event_program_items']) {
      assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 1);
    }
    assert.deepEqual((await pg.query('SELECT event_slug FROM admin_event_access ORDER BY event_slug')).rows, [{ event_slug: 'another-event' }, { event_slug: 'test-halloween' }]);
    const [event] = (await pg.query('SELECT status,sales_state,deleted_at FROM events')).rows;
    assert.equal(event.status, 'published'); assert.equal(event.sales_state, 'closed'); assert.ok(event.deleted_at);
    assert.deepEqual((await pg.query("SELECT action,details->>'slug' AS slug FROM admin_audit_log")).rows, [{ action: 'event.delete', slug: 'test-halloween' }]);
    assert.deepEqual(invalidated, ['events', '/events/test-halloween', '/events/test-halloween/rules']);
  } finally { await pg.close(); }
});

test('all order statuses and zero-price history survive retirement; retries do not duplicate the deletion audit', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    for (const status of ['pending', 'paid', 'cancelled', 'refunded', 'expired']) {
      await pg.query('INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES($1,$2,$3,$4,$5,$6,0,0)', [status, actor, 'test-halloween', 'owner@example.test', 'Гость', status]);
    }
    await deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween');
    await deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 5);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM events')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM event_ticket_categories')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM events e WHERE (to_jsonb(e)->>\'deleted_at\') IS NULL')).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('related photos, reviews, promos and prepared personal campaigns remain attached to the historical event', async () => {
  const { pg, sql } = await fixture({ guests: 1 });
  try {
    const id = await eventId(pg);
    for (const [table, statement] of [
      ['media_photos', "INSERT INTO media_photos(event_slug,url) VALUES('test-halloween','https://example.test/photo.jpg')"],
      ['media_reviews', "INSERT INTO media_reviews(event_slug,author,body) VALUES('test-halloween','Гость','Отзыв')"],
      ['promo_codes', "INSERT INTO promo_codes(event_slug,code,discount_type,discount_value) VALUES('test-halloween','GUEST','fixed',10)"],
    ]) {
      await pg.exec(statement);
    }
    await personal.savePersonalCampaign(sql, { actorId: actor, eventSlug: 'test-halloween', categoryId: 'standard', title: 'Для своих', description: 'Приглашение', levels: ['GOLD'] });
    await deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween');
    for (const table of ['media_photos', 'media_reviews', 'promo_codes']) assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table} WHERE event_slug='test-halloween'`)).rows[0].n, 1);
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
      '@/lib/events': { events: [seeded, { ...seeded, slug: 'fresh-built-in' }] }, './db': { db: () => sql }, './event-deletion': deletion, './hot-tickets': hot,
    });
    process.env.DATABASE_URL = 'isolated-fixture';
    await ensureSeedEvents();
    await ensureSeedEvents();
    assert.deepEqual((await pg.query('SELECT slug FROM events e WHERE (to_jsonb(e)->>\'deleted_at\') IS NULL')).rows, [{ slug: 'fresh-built-in' }]);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM events WHERE slug='test-halloween'")).rows[0].n, 1);
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

test('reload excludes retired events from public and scoped management lists but preserves their direct page', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  const configured = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'isolated-fixture';
    const published = await loadTsx('../lib/server/events.ts', { './db': { db: () => sql }, './hot-tickets': hot, '../events': lifecycle, '../legal': legal, react: { cache: callback => callback } });
    const access = { userId: actor, allEvents: false, eventSlugs: ['test-halloween'] };
    const managed = await loadTsx('../app/api/admin/events/route.ts', {
      '@/lib/server/db': { db: () => sql }, '@/lib/server/admin': { AdminAccessError, requireAdminPermission: async () => access, canAccessEvent: (access, slug) => access.eventSlugs.includes(slug) },
      '@/lib/server/seed-events': { ensureSeedEvents: async () => {} }, '@/lib/server/public-content': { invalidatePublicContent() {} }, 'next/cache': { revalidatePath() {} },
      '@/lib/server/hot-tickets': hot,
    });
    // Legacy schema has no deleted_at yet: the compatibility predicate is safe.
    assert.equal((await published.getPublicEventCatalogServer()).length, 1);
    assert.equal((await (await managed.GET()).json()).events.length, 1);
    await deletion.deleteUnusedEvent(sql, await eventId(pg), actor, 'test-halloween');
    assert.equal((await published.getPublicEventCatalogServer()).length, 0);
    assert.equal((await published.getAllEventsServer()).length, 0);
    assert.equal((await (await managed.GET()).json()).events.length, 0);
    const historical = await published.getEventServer('test-halloween');
    assert.equal(historical.title, 'AGAYO HALLOWEEN'); assert.equal(historical.salesState, 'closed'); assert.equal(historical.tickets.length, 1);
    // Audit retention cannot revive business state or reopen its page for sales.
    await pg.exec("DELETE FROM admin_audit_log; UPDATE events SET sales_state='open'");
    assert.equal((await published.getPublicEventCatalogServer()).length, 0);
    assert.equal((await published.getEventServer('test-halloween')).salesState, 'closed');
  } finally {
    if (configured === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = configured;
    await pg.close();
  }
});

test('a stale editor cannot publish an event retired between its first read and the row lock', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const id = await eventId(pg);
    const { PATCH, GET } = await api(sql, async () => { await deletion.deleteUnusedEvent(sql, id, actor, 'test-halloween'); return { userId: actor }; });
    const request = new Request('https://example.test/api/admin/events/fixture', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Нельзя оживлять', startsAt: '2080-11-01T18:00:00Z', status: 'published', salesState: 'open' }) });
    assert.equal((await PATCH(request, { params: Promise.resolve({ id }) })).status, 410);
    assert.equal((await GET(new Request('https://example.test'), { params: Promise.resolve({ id }) })).status, 410);
    assert.deepEqual((await pg.query('SELECT title,sales_state FROM events')).rows, [{ title: 'AGAYO HALLOWEEN', sales_state: 'closed' }]);
  } finally { await pg.close(); }
});

test('a stale open checkout cannot reserve or charge a retired event even if its sales flag was reopened separately', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  const paymentsEnabled = process.env.PAYMENTS_ENABLED;
  try {
    process.env.PAYMENTS_ENABLED = '1';
    await deletion.deleteUnusedEvent(sql, await eventId(pg), actor, 'test-halloween');
    await pg.exec("UPDATE events SET sales_state='open'");
    const unexpected = () => { throw new Error('External payment must not be called'); };
    const security = await loadTs('../lib/server/security.ts');
    const orderInput = await loadTs('../lib/order-input.ts');
    const { POST } = await loadTsx('../app/api/orders/route.ts', {
      '@/lib/server/db': { db: () => sql }, '@/lib/server/events': { getEventServer: async () => ({ ...lifecycle.events[0], slug: 'test-halloween', status: 'published', salesState: 'open', startsAt: '2080-11-01T18:00:00Z', tickets: [{ id: 'standard', name: 'STANDARD', price: 300 }] }) },
      '@/lib/events': lifecycle, '@/lib/server/security': security, '@/lib/server/yookassa': { isYooKassaConfigured: () => true, isReceiptConfigurationReady: () => true, createPayment: unexpected },
      '@/lib/legal': { DEFAULT_EVENT_RULES: 'Правила', LEGAL_VERSION: 'fixture' }, '@/lib/order-input': orderInput,
    });
    const response = await POST(new Request('https://example.test/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventSlug: 'test-halloween', categoryId: 'standard', quantity: 1, email: 'owner@example.test', name: 'Owner', acceptedDocuments: true, acceptedPrivacy: true }) }));
    assert.equal(response.status, 409);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM ticket_inventory_reservations')).rows[0].n, 0);
  } finally {
    if (paymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = paymentsEnabled;
    await pg.close();
  }
});

test('event list exposes deletion only to event managers within their event scope', async () => {
  const { default: Manager } = await loadTsx('../components/AdminEventsManager.tsx', {
    '@/lib/client/upload': {}, '@/lib/event-palette': {}, '@/lib/legal': { DEFAULT_EVENT_RULES: '' },
    '@/lib/admin-ticket-theme': await loadTsx('../lib/admin-ticket-theme.ts'),
  });
  const events = [{ id: actor, slug: 'allowed', title: 'Событие', starts_at: '2080-11-01', ends_at: null, status: 'draft', sales_state: 'closed', ticket_mode: 'zones' }];
  const html = access => renderToStaticMarkup(createElement(Manager, { access, previewMode: false, events, setEvents: () => {} }));
  const base = { role: 'organizer', permissions: ['manage_events'], allEvents: false, eventSlugs: ['allowed'] };
  assert.ok(html(base).includes('Удалить мероприятие'));
  assert.equal(html({ ...base, permissions: [] }).includes('Удалить мероприятие'), false);
  assert.equal(html({ ...base, eventSlugs: ['another-event'] }).includes('Удалить мероприятие'), false);
});
