import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';

const security = await loadTs('../lib/server/security.ts');
const lifecycle = await loadTs('../lib/events.ts');
const orderInput = await loadTs('../lib/order-input.ts');
const yookassa = await loadTs('../lib/server/yookassa.ts');
const personal = await loadTs('../lib/server/personal-ticket-store.ts');
const event = { ...lifecycle.events[0], slug: 'test-halloween', title: 'AGAYO HALLOWEEN', status: 'published', salesState: 'open', startsAt: '2080-11-01T18:00:00Z', tickets: [{ id: 'standard', name: 'STANDARD', price: 300 }] };
class AdminAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
const allow = async () => ({ userId: actor });
const unexpected = () => { throw new Error('An external provider must not be called'); };

async function setup(options) {
  const value = await fixture(options);
  await value.pg.exec('ALTER TABLE tickets ADD COLUMN used_by uuid; ALTER TABLE orders ADD COLUMN refunded_amount numeric(12,2) NOT NULL DEFAULT 0; CREATE TABLE ticket_refunds(ticket_id uuid UNIQUE REFERENCES tickets(id),status text)');
  return value;
}

async function restoreApi(sql, requireAdminPermission = allow) {
  return loadTsx('../app/api/admin/tickets/action/route.ts', {
    '@/lib/server/db': { db: () => sql }, '@/lib/server/admin': { AdminAccessError, requireAdminPermission, writeAdminAudit: unexpected },
    '@/lib/server/yookassa': { createRefund: unexpected, getPayment: unexpected },
    '@/lib/server/payment-processing': { syncYooKassaRefund: unexpected },
    '@/lib/server/loyalty': { updateUserLoyaltyByVisits: unexpected }, '@/lib/server/refund-policy': {},
    '@/lib/server/ticket-refunds': {}, '@/lib/server/npd': {},
  });
}

async function eventApi(sql, requireAdminPermission = allow) {
  return loadTsx('../app/api/admin/events/[id]/route.ts', {
    '@/lib/server/db': { db: () => sql }, '@/lib/server/admin': { AdminAccessError, requireAdminPermission },
    '@/lib/server/event-deletion': {}, '@/lib/server/public-content': { invalidatePublicContent: () => {} },
    'next/cache': { revalidatePath: () => {} },
  });
}

async function checkoutApi(sql) {
  return loadTsx('../app/api/orders/route.ts', {
    '@/lib/server/db': { db: () => sql }, '@/lib/server/events': { getEventServer: async () => event },
    '@/lib/events': lifecycle, '@/lib/server/security': security,
    '@/lib/server/yookassa': { ...yookassa, isYooKassaConfigured: () => true, isReceiptConfigurationReady: () => true,
      createPayment: async input => ({ id: input.orderPublicId, confirmation: { confirmation_url: 'https://example.test/payment' } }) },
    '@/lib/legal': { DEFAULT_EVENT_RULES: 'Правила', LEGAL_VERSION: 'fixture' }, '@/lib/order-input': orderInput,
  });
}

let sequence = 0;
async function addOrder(pg, { status = 'pending', quantity = 1, reserved = false, ticketStatus } = {}) {
  const name = `fixture-${++sequence}`;
  const [order] = (await pg.query('INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id', [name, actor, event.slug, 'owner@example.test', 'Owner', status, 300 * quantity])).rows;
  await pg.query('INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES($1,$2,$3,300,$4)', [order.id, 'standard', 'STANDARD', quantity]);
  if (reserved) await pg.query('INSERT INTO ticket_inventory_reservations(order_id,event_slug,category_id,quantity) VALUES($1,$2,$3,$4)', [order.id, event.slug, 'standard', quantity]);
  if (ticketStatus) {
    const [ticket] = (await pg.query('INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,status) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [name, order.id, actor, event.slug, 'Owner', 'standard', 'STANDARD', ticketStatus])).rows;
    order.ticketId = ticket.id;
  }
  return order;
}

const restoreRequest = ticketId => new Request('https://example.test/api/admin/tickets/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore_ticket', ticketId }) });
const checkoutRequest = () => new Request('https://example.test/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventSlug: event.slug, categoryId: 'standard', quantity: 1, email: 'owner@example.test', name: 'Owner', acceptedDocuments: true, acceptedPrivacy: true }) });
const patchRequest = (inventory, title = 'Изменённое событие') => new Request('https://example.test/api/admin/events/fixture', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, startsAt: event.startsAt, status: 'published', salesState: 'open', ticketMode: 'zones', tickets: [{ id: 'standard', name: 'STANDARD', price: 300, inventory }] }) });
const params = async pg => ({ params: Promise.resolve({ id: (await pg.query('SELECT id FROM events')).rows[0].id }) });
const ticketStatus = async (pg, id) => (await pg.query('SELECT status FROM tickets WHERE id=$1', [id])).rows[0].status;

function recordTransactions(sql, transactions) {
  const wrap = (client, statements) => {
    const wrapped = (strings, ...values) => { statements?.push(strings.join('?').replace(/\s+/g, ' ').trim()); return client(strings, ...values); };
    wrapped.begin = callback => client.begin(tx => { const statements = []; transactions.push(statements); return callback(wrap(tx, statements)); });
    return wrapped;
  };
  return wrap(sql);
}

test('restore cannot reuse a sold/reserved last place; success and repeated restore audit exactly once', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 1 });
  try {
    const cancelled = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    const replacement = await addOrder(pg, { status: 'paid', ticketStatus: 'valid' });
    const { POST } = await restoreApi(sql);
    assert.equal((await POST(restoreRequest(cancelled.ticketId))).status, 409);
    assert.equal(await ticketStatus(pg, cancelled.ticketId), 'cancelled');
    await pg.query("UPDATE tickets SET status='cancelled' WHERE id=$1", [replacement.ticketId]);
    const pending = await addOrder(pg, { reserved: true });
    assert.equal((await POST(restoreRequest(cancelled.ticketId))).status, 409);
    await pg.query("UPDATE orders SET status='cancelled' WHERE id=$1", [pending.id]);
    await pg.query('UPDATE ticket_inventory_reservations SET released_at=now() WHERE order_id=$1', [pending.id]);
    assert.equal((await POST(restoreRequest(cancelled.ticketId))).status, 200);
    assert.equal((await POST(restoreRequest(cancelled.ticketId))).status, 200);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM admin_audit_log WHERE action='ticket.restore'")).rows[0].n, 1);
  } finally { await pg.close(); }
});

test('restore rechecks changed paid/refund/ticket state after the initial route read', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 10 });
  try {
    for (const change of ['order', 'pending-refund', 'succeeded-refund', 'failed-refund', 'ticket']) {
      const order = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
      const api = await restoreApi(sql, async (_permission, slug) => {
        if (slug) {
          if (change === 'order') await pg.query("UPDATE orders SET status='refunded' WHERE id=$1", [order.id]);
          else if (change === 'ticket') await pg.query("UPDATE tickets SET status='used' WHERE id=$1", [order.ticketId]);
          else await pg.query('INSERT INTO ticket_refunds(ticket_id,status) VALUES($1,$2)', [order.ticketId, change.replace('-refund', '')]);
        }
        return { userId: actor };
      });
      const response = await api.POST(restoreRequest(order.ticketId));
      assert.equal(response.status, 409, change);
      if (change.endsWith('-refund')) assert.match((await response.json()).error, /Сверьте.*провайдера/);
      assert.equal(await ticketStatus(pg, order.ticketId), change === 'ticket' ? 'used' : 'cancelled');
    }
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('restore audit failure rolls back the ticket and insufficient permission/scope never restores it', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 1 });
  try {
    const order = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    for (const scoped of [false, true]) {
      const denied = await restoreApi(sql, async (_permission, slug) => { if (!scoped || slug) throw new AdminAccessError('Нет доступа'); return { userId: actor }; });
      assert.equal((await denied.POST(restoreRequest(order.ticketId))).status, 403);
    }
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_restore CHECK(action <> 'ticket.restore') NOT VALID");
    const api = await restoreApi(sql);
    assert.equal((await api.POST(restoreRequest(order.ticketId))).status, 500);
    assert.equal(await ticketStatus(pg, order.ticketId), 'cancelled');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('limit includes sold plus reserved pending without double counting and failure rolls all event edits back', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 10 });
  try {
    await addOrder(pg, { status: 'paid', ticketStatus: 'valid' });
    await addOrder(pg, { reserved: true, quantity: 2 });
    const { PATCH } = await eventApi(sql);
    const context = await params(pg);
    assert.equal((await PATCH(patchRequest(2), context)).status, 409);
    assert.deepEqual((await pg.query('SELECT title FROM events')).rows, [{ title: event.title }]);
    assert.equal((await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory, 10);
    assert.equal((await PATCH(patchRequest(3), context)).status, 200);
    assert.equal((await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory, 3);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM admin_audit_log WHERE action='event.update'")).rows[0].n, 1);
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_update CHECK(action <> 'event.update') NOT VALID");
    assert.equal((await PATCH(patchRequest(4, 'Не должно сохраниться'), context)).status, 500);
    assert.deepEqual((await pg.query('SELECT title FROM events')).rows, [{ title: 'Изменённое событие' }]);
    assert.equal((await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory, 3);
  } finally { await pg.close(); }
});

test('null to finite counts old pending without reservations; checkout, gifts and restore honor those places', async () => {
  const { pg, sql } = await setup({ guests: 1, inventory: 10 });
  const flag = process.env.PAYMENTS_ENABLED; process.env.PAYMENTS_ENABLED = '1';
  try {
    await pg.exec('UPDATE event_ticket_categories SET inventory=NULL');
    await addOrder(pg, { quantity: 2 });
    const cancelled = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    const { PATCH } = await eventApi(sql);
    const context = await params(pg);
    assert.equal((await PATCH(patchRequest(1), context)).status, 409);
    assert.equal((await PATCH(patchRequest(2), context)).status, 200);
    assert.equal((await (await checkoutApi(sql)).POST(checkoutRequest())).status, 409);
    assert.equal((await (await restoreApi(sql)).POST(restoreRequest(cancelled.ticketId))).status, 409);
    const campaign = await personal.savePersonalCampaign(sql, { actorId: actor, eventSlug: event.slug, categoryId: 'standard', title: 'Гости', description: '', levels: ['GOLD'] });
    await assert.rejects(personal.issuePersonalBatch(sql, campaign.id, actor), personal.PersonalTicketError);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE status='valid'")).rows[0].n, 0);
  } finally { if (flag === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = flag; await pg.close(); }
});

test('simultaneous restorations compete for the last place and use event/category before order/ticket locks', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 1 });
  try {
    const first = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    const second = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    const transactions = [];
    const api = await restoreApi(recordTransactions(sql, transactions));
    const replies = await Promise.all([api.POST(restoreRequest(first.ticketId)), api.POST(restoreRequest(second.ticketId))]);
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE status='valid'")).rows[0].n, 1);
    for (const statements of transactions) {
      const locks = statements.filter(statement => statement.includes('FOR UPDATE'));
      assert.match(locks[0], /FROM events/); assert.match(locks[1], /FROM event_ticket_categories/);
      assert.match(locks[2], /FROM orders/); assert.match(locks[3], /FROM tickets/);
      assert.ok(statements.findIndex(statement => statement.includes('AS unreserved_pending')) > statements.indexOf(locks[1]));
    }
  } finally { await pg.close(); }
});

test('simultaneous checkout and restore admit exactly one last place', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 1 });
  const flag = process.env.PAYMENTS_ENABLED; process.env.PAYMENTS_ENABLED = '1';
  try {
    const order = await addOrder(pg, { status: 'paid', ticketStatus: 'cancelled' });
    const [restore, checkout] = await Promise.all([restoreApi(sql), checkoutApi(sql)]);
    const replies = await Promise.all([checkout.POST(checkoutRequest()), restore.POST(restoreRequest(order.ticketId))]);
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    const [counts] = (await pg.query("SELECT (SELECT count(*) FROM tickets WHERE status IN ('valid','used')) + (SELECT coalesce(sum(quantity),0) FROM ticket_inventory_reservations WHERE released_at IS NULL AND consumed_at IS NULL) AS occupied")).rows;
    assert.equal(Number(counts.occupied), 1);
  } finally { if (flag === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = flag; await pg.close(); }
});

test('simultaneous limit reduction and checkout serialize, preserving the winning capacity decision', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 1 });
  const flag = process.env.PAYMENTS_ENABLED; process.env.PAYMENTS_ENABLED = '1';
  try {
    const transactions = [];
    const recorded = recordTransactions(sql, transactions);
    const [admin, checkout] = await Promise.all([eventApi(recorded), checkoutApi(recorded)]);
    const context = await params(pg);
    const replies = await Promise.all([admin.PATCH(patchRequest(0), context), checkout.POST(checkoutRequest())]);
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    const inventory = (await pg.query('SELECT inventory FROM event_ticket_categories')).rows[0].inventory;
    const pending = (await pg.query("SELECT count(*)::int AS n FROM orders WHERE status='pending'")).rows[0].n;
    assert.ok((inventory === 0 && pending === 0) || (inventory === 1 && pending === 1));
    for (const statements of transactions) {
      const locks = statements.filter(statement => statement.includes('FOR UPDATE'));
      assert.match(locks[0], /FROM events/); assert.match(locks[1], /FROM event_ticket_categories/);
      const count = statements.findIndex(statement => statement.includes('AS unreserved_pending'));
      assert.ok(count > statements.indexOf(locks[1]));
    }
  } finally { if (flag === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = flag; await pg.close(); }
});

test('live event getters include old unreserved pending in remaining/soldOut/hot without double counting active reserves', async () => {
  const { pg, sql } = await setup({ guests: 0, inventory: 10 });
  const configured = process.env.DATABASE_URL; process.env.DATABASE_URL = 'isolated-fixture';
  try {
    await pg.exec('UPDATE event_ticket_categories SET hot_enabled=true');
    await addOrder(pg, { status: 'paid', ticketStatus: 'valid' });
    await addOrder(pg, { quantity: 2, reserved: true });
    await addOrder(pg, { quantity: 3 });
    const other = await addOrder(pg, { quantity: 4 });
    await pg.query("UPDATE order_items SET ticket_category_id='other' WHERE order_id=$1", [other.id]);
    await pg.exec("INSERT INTO event_ticket_categories(event_id,category_key,name,price,inventory) SELECT id,'other','OTHER',300,5 FROM events");
    await addOrder(pg, { status: 'cancelled', quantity: 6 });
    const getters = await loadTsx('../lib/server/events.ts', { './db': { db: () => sql }, '../events': lifecycle, '../legal': { DEFAULT_EVENT_RULES: 'Правила' }, react: { cache: callback => callback } });
    for (const read of [() => getters.getEventServer(event.slug), async () => (await getters.getAllEventsServer())[0]]) {
      const loaded = await read();
      const standard = loaded.tickets.find(item => item.id === 'standard');
      assert.equal(standard.remaining, 4);
      assert.equal(standard.soldOut, false);
      assert.deepEqual(standard.hotTickets, { enabled: true, displayedRemaining: 4 });
      assert.equal(loaded.tickets.find(item => item.id === 'other').remaining, 1);
    }
    await pg.exec("UPDATE event_ticket_categories SET inventory=6 WHERE category_key='standard'");
    for (const loaded of [await getters.getEventServer(event.slug), ...(await getters.getAllEventsServer())]) {
      const standard = loaded.tickets.find(item => item.id === 'standard');
      assert.equal(standard.remaining, 0);
      assert.equal(standard.soldOut, true);
      assert.equal(standard.hotTickets, undefined);
    }
    await pg.exec("UPDATE event_ticket_categories SET inventory=NULL WHERE category_key='standard'");
    assert.equal((await getters.getEventServer(event.slug)).tickets.find(item => item.id === 'standard').remaining, null);
  } finally { if (configured === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = configured; await pg.close(); }
});
