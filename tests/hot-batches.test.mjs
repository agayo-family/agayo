import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture as databaseFixture, actor } from './database-fixture.mjs';
import { postgresDriverSql } from './postgres-driver-sql.mjs';

const hot = await loadTs('../lib/server/hot-tickets.ts');
const lifecycle = await loadTs('../lib/events.ts');
const legal = await loadTs('../lib/legal.ts');
class AdminAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
const allow = async () => ({ userId: actor, role: 'owner', allEvents: true });
async function fixture(options = {}) { const value = await databaseFixture({ guests: 0, ...options }); return { ...value, sql: postgresDriverSql(value.pg) }; }
async function api(sql, allowAccess = allow) {
  const shared = { '@/lib/server/db': { db: () => sql }, '@/lib/server/admin': { AdminAccessError, requireAdminPermission: allowAccess, canAccessEvent: () => true },
    '@/lib/server/hot-tickets': hot, '@/lib/server/public-content': { invalidatePublicContent() {} }, 'next/cache': { revalidatePath() {} } };
  return {
    ...(await loadTsx('../app/api/admin/events/[id]/route.ts', { ...shared, '@/lib/server/event-deletion': {} })),
    CREATE: (await loadTsx('../app/api/admin/events/route.ts', { ...shared, '@/lib/server/seed-events': {} })).POST,
  };
}
const body = (enabled, extra = {}) => ({ title: 'AGAYO HALLOWEEN', startsAt: '2080-11-01T18:00:00Z', status: 'published', salesState: 'open', ticketMode: 'zones',
  tickets: [{ id: 'standard', name: 'STANDARD', price: 300, inventory: '', hotEnabled: enabled }], ...extra });
const request = (payload, method = 'PATCH') => new Request('https://example.test/api/admin/events/fixture', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const context = async pg => ({ params: Promise.resolve({ id: (await pg.query("SELECT id FROM events WHERE slug='test-halloween'")).rows[0].id }) });
const boundary = async pg => (await pg.query("SELECT hot_batch_started_at FROM event_ticket_categories WHERE category_key='standard'")).rows[0].hot_batch_started_at;
async function getters(sql) { return loadTsx('../lib/server/events.ts', { './db': { db: () => sql }, './hot-tickets': hot, '../events': lifecycle, '../legal': legal, react: { cache: callback => callback } }); }

test('promotion batches roll 5→3→5→3, honor real stock and never change unlimited capacity', () => {
  assert.deepEqual([0, 2, 5, 7].map(sold => hot.hotBatchRemaining(true, sold, null)), [5, 3, 5, 3]);
  assert.equal(hot.hotBatchRemaining(true, 0, 2), 2);
  assert.equal(hot.hotBatchRemaining(true, 0, 0), undefined);
  assert.equal(hot.hotBatchRemaining(false, 2, null), undefined);
  assert.equal(hot.hotBatchRemaining(true, Infinity, null), undefined);
});

test('activation persists across ordinary saves; disabling and enabling starts a new batch without changing inventory', async () => {
  const { pg, sql } = await fixture();
  try {
    const { PATCH } = await api(sql), params = await context(pg);
    assert.equal((await PATCH(request(body(true)), params)).status, 200);
    assert.ok(await boundary(pg));
    await pg.exec("UPDATE event_ticket_categories SET hot_batch_started_at='2026-10-01T10:00:00Z'");
    const original = await boundary(pg);
    assert.equal((await PATCH(request(body(true, { title: 'Только другое название' })), params)).status, 200);
    assert.deepEqual(await boundary(pg), original);
    assert.equal((await PATCH(request(body(false)), params)).status, 200);
    assert.equal(await boundary(pg), null);
    assert.equal((await PATCH(request(body(true)), params)).status, 200);
    assert.ok(+new Date(await boundary(pg)) > +new Date(original));
    assert.equal((await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory, null);
    assert.equal((await pg.query('SELECT jsonb_typeof(details) AS kind FROM admin_audit_log LIMIT 1')).rows[0].kind, 'object');
  } finally { await pg.close(); }
});

test('only paid units of this category and event after activation advance the batch; gifts and full refunds behave correctly', async () => {
  const { pg, sql } = await fixture();
  const configured = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'isolated-fixture';
    await hot.ensureHotTicketSchema(sql);
    await pg.exec("UPDATE event_ticket_categories SET inventory=NULL,hot_enabled=true,hot_batch_started_at='2026-10-16T10:00:00Z',hot_displayed_remaining=1");
    let sequence = 0;
    const add = async ({ quantity, paid = true, total = 300, category = 'standard', event = 'test-halloween', paidAt = '2026-10-16T11:00:00Z', status = paid ? 'paid' : 'pending' }) => {
      const [order] = (await pg.query('INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total,paid_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING id', [`hot-${++sequence}`, actor, event, 'owner@example.test', 'Гость', status, total, paid ? paidAt : null])).rows;
      await pg.query('INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES($1,$2,$2,300,$3)', [order.id, category, quantity]);
      return order.id;
    };
    await add({ quantity: 4, paidAt: '2026-10-16T09:59:59Z' });
    await add({ quantity: 5, paid: false });
    await add({ quantity: 5, total: 0 });
    await add({ quantity: 8, category: 'other' });
    await add({ quantity: 9, event: 'other-event' });
    const loaded = await getters(sql);
    const batch = async () => (await loaded.getEventServer('test-halloween')).tickets[0].hotTickets;
    assert.deepEqual(await batch(), { enabled: true, batchRemaining: 5 });
    await add({ quantity: 2 });
    assert.deepEqual(await batch(), { enabled: true, batchRemaining: 3 });
    const refunded = await add({ quantity: 3 });
    assert.deepEqual(await batch(), { enabled: true, batchRemaining: 5 });
    await pg.query("UPDATE orders SET status='refunded' WHERE id=$1", [refunded]);
    assert.deepEqual(await batch(), { enabled: true, batchRemaining: 5 });
    await add({ quantity: 2 });
    assert.deepEqual(await batch(), { enabled: true, batchRemaining: 3 });
    assert.deepEqual((await loaded.getAllEventsServer())[0].tickets[0].hotTickets, { enabled: true, batchRemaining: 3 });
    assert.equal((await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory, null);
  } finally { if (configured === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = configured; await pg.close(); }
});

test('migration bootstraps legacy flags once and public reads stay available before its application', async () => {
  const { pg, sql } = await fixture();
  const configured = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'isolated-fixture';
    await pg.exec('UPDATE event_ticket_categories SET hot_enabled=true,hot_displayed_remaining=1');
    const loaded = await getters(sql);
    assert.deepEqual((await loaded.getEventServer('test-halloween')).tickets[0].hotTickets, { enabled: true, batchRemaining: 5 });
    assert.equal((await pg.query("SELECT to_jsonb(c)->>'hot_batch_started_at' AS boundary FROM event_ticket_categories c")).rows[0].boundary, null);
    const migration = await readFile(new URL('../db/018_hot_batches.sql', import.meta.url), 'utf8');
    await pg.exec(migration);
    const original = await boundary(pg);
    assert.ok(original);
    await pg.exec(migration);
    assert.deepEqual(await boundary(pg), original);
    assert.equal((await pg.query('SELECT hot_displayed_remaining FROM event_ticket_categories')).rows[0].hot_displayed_remaining, null);
  } finally { if (configured === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = configured; await pg.close(); }
});

test('event creation sets a promotion boundary atomically and scoped managers cannot create unassigned events', async () => {
  const { pg, sql } = await fixture();
  try {
    const { CREATE } = await api(sql);
    const response = await CREATE(request(body(true, { slug: 'new-hot-event' }), 'POST'));
    assert.equal(response.status, 200);
    const created = await response.json();
    assert.ok((await pg.query('SELECT hot_batch_started_at FROM event_ticket_categories WHERE event_id=$1', [created.id])).rows[0].hot_batch_started_at);
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_create CHECK(action <> 'event.create') NOT VALID");
    assert.equal((await CREATE(request(body(true, { slug: 'should-roll-back' }), 'POST'))).status, 500);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM events WHERE slug='should-roll-back'")).rows[0].n, 0);
    const scoped = await api(sql, async () => ({ userId: actor, role: 'organizer', allEvents: false }));
    assert.equal((await scoped.CREATE(request(body(true), 'POST'))).status, 403);
  } finally { await pg.close(); }
});
