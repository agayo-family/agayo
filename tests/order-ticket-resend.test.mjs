import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';
import { postgresDriverSql } from './postgres-driver-sql.mjs';

const transport = await loadTsx('../lib/server/email-transport.ts');
const event = { slug: 'test-halloween', title: 'ORIGINAL EVENT', dateLabel: '01.11.80', timeLabel: '18:00',
  city: 'Йошкар-Ола', ageLabel: '14+', alcoholFree: true, heroImage: '/poster.jpg', tickets: [{ id: 'standard', name: 'STANDARD' }] };

async function setup(quantity = 1, sender) {
  const f = await fixture({ guests: 0 });
  const sql = postgresDriverSql(f.pg);
  const [order] = (await f.pg.query("INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES('ORDER-RESEND',$1,'test-halloween','original-buyer@example.test','Исходный владелец','paid',600,600) RETURNING *", [actor])).rows;
  for (let i = 0; i < quantity; i++) await f.pg.query("INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,status) VALUES($1,$2,$3,$4,'test-halloween','Исходный владелец','standard','STANDARD','valid')", [`TKT-RESEND-${i}`, `original-qr-${i}`, order.id, actor]);
  const calls = [];
  let transactions = 0;
  const tracked = (...args) => sql(...args);
  tracked.begin = async callback => { transactions++; try { return await sql.begin(callback); } finally { transactions--; } };
  const api = await loadTsx('../lib/server/order-ticket-resend.ts', { './email-transport': transport,
    './email': { sendTicketEmail: async (...args) => {
      assert.equal(transactions, 0); calls.push(args);
      return sender ? sender(...args) : { channel: 'email', providerId: 'isolated-email-id' };
    } },
  });
  const prepare = (requestId = randomUUID(), changedEvent = event) => api.prepareOrderResend(tracked, {
    requestId, orderId: order.id, actorId: actor, event: changedEvent, baseUrl: 'https://www.agayo.ru',
  });
  return { ...f, sql: tracked, order, api, calls, prepare };
}

test('manual resend sends already-delivered purchased tickets by email with exactly their stored IDs and QR tokens', async () => {
  const f = await setup(2);
  try {
    await f.pg.exec("INSERT INTO ticket_deliveries(ticket_id,channel,destination,status) SELECT id,'email','original-buyer@example.test','sent' FROM tickets");
    await f.pg.exec("UPDATE users SET email='changed-profile@example.test'");
    const before = (await f.pg.query('SELECT id,public_id,qr_token,status FROM tickets ORDER BY public_id')).rows;
    const request = await f.prepare();
    const result = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.deepEqual([result.status, result.sent, result.total], ['sent', 2, 2]); assert.equal(f.calls.length, 2);
    for (const [index, call] of f.calls.entries()) {
      assert.equal(call[0], 'original-buyer@example.test');
      assert.equal(call[1].ticketId, before[index].public_id); assert.equal(call[1].qrToken, before[index].qr_token);
      assert.equal(new URL(call[1].ticketUrl).pathname, `/tickets/${before[index].qr_token}`);
      assert.deepEqual(call[2], { emailOnly: true });
    }
    assert.deepEqual((await f.pg.query('SELECT id,public_id,qr_token,status FROM tickets ORDER BY public_id')).rows, before);
    assert.equal((await f.pg.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, 1);
    await f.prepare(request.id, { ...event, title: 'CHANGED EVENT' });
    await f.api.runOrderResend(f.sql, request.id, actor); assert.equal(f.calls.length, 2);
    const [stored] = (await f.pg.query('SELECT payload FROM ticket_resend_requests WHERE id=$1', [request.id])).rows;
    assert.equal(stored.payload.items[0].input.eventTitle, 'ORIGINAL EVENT');
  } finally { await f.pg.close(); }
});

test('a partial failure resumes only remaining tickets with unchanged provider keys and preserves successful original delivery status', async () => {
  let fail = true;
  const f = await setup(2, async (_to, input) => {
    if (input.ticketId === 'TKT-RESEND-1' && fail) throw new transport.EmailDeliveryError('network', null, true);
    return { channel: 'email', providerId: 'isolated-email-id' };
  });
  try {
    await f.pg.exec("INSERT INTO ticket_deliveries(ticket_id,channel,destination,status) SELECT id,'email','original-buyer@example.test','sent' FROM tickets");
    const request = await f.prepare();
    const first = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.equal(first.status, 'failed'); assert.equal(first.sent, 1);
    assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM ticket_deliveries WHERE status='sent'")).rows[0].n, 2);
    const key = f.calls[1][1].deliveryKey;
    fail = false;
    const second = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.equal(second.status, 'sent'); assert.equal(f.calls.length, 3);
    assert.equal(f.calls[2][1].ticketId, 'TKT-RESEND-1'); assert.equal(f.calls[2][1].deliveryKey, key);
  } finally { await f.pg.close(); }
});

test('concurrent clicks share a durable claim; a new explicit resend uses a new key after its cooldown', async () => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const f = await setup(1, async () => { started(); await gate; return { channel: 'email', providerId: 'isolated-email-id' }; });
  try {
    const request = await f.prepare();
    const running = f.api.runOrderResend(f.sql, request.id, actor); await entered;
    assert.equal((await f.api.runOrderResend(f.sql, request.id, actor)).status, 'sending'); assert.equal(f.calls.length, 1);
    release(); await running;
    await assert.rejects(f.prepare(), { status: 429 });
    await f.pg.exec("UPDATE ticket_resend_requests SET created_at=now()-interval '2 minutes'");
    const next = await f.prepare(); await f.api.runOrderResend(f.sql, next.id, actor);
    assert.equal(f.calls.length, 2); assert.notEqual(f.calls[0][1].deliveryKey, f.calls[1][1].deliveryKey);
    assert.equal(f.calls[0][1].qrToken, f.calls[1][1].qrToken);
  } finally { release?.(); await f.pg.close(); }
});

test('unpaid orders, refunded tickets and another employee request cannot trigger sending', async () => {
  const f = await setup();
  try {
    await f.pg.exec("UPDATE orders SET status='pending'"); await assert.rejects(f.prepare());
    await f.pg.exec("UPDATE orders SET status='paid'; UPDATE tickets SET status='refunded'"); await assert.rejects(f.prepare());
    await f.pg.exec("UPDATE tickets SET status='valid'"); const request = await f.prepare();
    await assert.rejects(f.api.runOrderResend(f.sql, request.id, randomUUID()), { status: 404 });
    await f.pg.exec("UPDATE orders SET status='refunded'");
    const result = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.equal(result.status, 'failed'); assert.match(result.message, /отменён или возвращён/); assert.equal(f.calls.length, 0);
  } finally { await f.pg.close(); }
});

test('personal descriptions are preserved and frozen stale identity cannot replace the actual purchased QR', async () => {
  const f = await setup();
  try {
    await f.pg.exec(await readFile(new URL('../db/013_personal_tickets.sql', import.meta.url), 'utf8'));
    const [campaign] = (await f.pg.query("INSERT INTO personal_ticket_campaigns(event_slug,category_id,title,description,levels,recipients,created_by) VALUES('test-halloween','standard','Только тебе','Личное описание','[]','[]',$1) RETURNING id", [actor])).rows;
    const [ticket] = (await f.pg.query('SELECT id FROM tickets LIMIT 1')).rows;
    await f.pg.query('INSERT INTO personal_ticket_grants(campaign_id,user_id,ticket_id,email_payload) VALUES($1,$2,$3,$4::text::jsonb)', [campaign.id, actor, ticket.id,
      JSON.stringify({ personalTitle: 'Замороженный заголовок', personalDescription: 'Исходный текст', eventTitle: 'Old event', qrToken: 'MUST_NOT_USE', ticketId: 'MUST_NOT_USE' })]);
    const request = await f.prepare(); await f.api.runOrderResend(f.sql, request.id, actor);
    assert.equal(f.calls[0][1].personalDescription, 'Исходный текст');
    assert.equal(f.calls[0][1].personalTitle, 'Замороженный заголовок');
    assert.equal(f.calls[0][1].qrToken, 'original-qr-0'); assert.equal(f.calls[0][1].ticketId, 'TKT-RESEND-0');
  } finally { await f.pg.close(); }
});

test('expired unknown operations stop before provider I/O and request IDs cannot move to another order', async () => {
  const f = await setup();
  try {
    const request = await f.prepare();
    await f.pg.exec("UPDATE ticket_resend_requests SET first_attempt_at=now()-interval '25 hours'");
    await assert.rejects(f.api.runOrderResend(f.sql, request.id, actor), /устарел/);
    const [other] = (await f.pg.query("INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES('OTHER-ORDER',$1,'test-halloween','other@example.test','Other','paid',300,300) RETURNING id", [actor])).rows;
    await assert.rejects(f.api.prepareOrderResend(f.sql, { requestId: request.id, orderId: other.id, actorId: actor, event, baseUrl: 'https://www.agayo.ru' }), /другому заказу/);
    assert.equal(f.calls.length, 0);
  } finally { await f.pg.close(); }
});

test('large orders persist bounded progress and continue without repeating accepted tickets', async () => {
  const f = await setup(8);
  try {
    const request = await f.prepare();
    const first = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.deepEqual([first.status, first.sent, first.total], ['pending', 6, 8]);
    const second = await f.api.runOrderResend(f.sql, request.id, actor);
    assert.deepEqual([second.status, second.sent, second.total], ['sent', 8, 8]);
    assert.equal(f.calls.length, 8);
    assert.equal(new Set(f.calls.map(call => call[1].ticketId)).size, 8);
  } finally { await f.pg.close(); }
});

test('resend endpoint checks session permission, same origin and event scope before creating requests or sending', async () => {
  class AdminAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
  let prepares = 0; let authorize = false;
  const route = await loadTsx('../app/api/admin/orders/[publicId]/resend/route.ts', {
    '@/lib/server/admin': { AdminAccessError, requireAdminPermission: async (_permission, slug) => {
      if (!authorize || slug) throw new AdminAccessError('Forbidden'); return { userId: actor };
    } },
    '@/lib/server/db': { db: () => async () => [{ id: randomUUID(), event_slug: 'not-permitted', status: 'paid' }] },
    '@/lib/server/events': {}, '@/lib/site': {},
    '@/lib/server/order-ticket-resend': { TicketResendError: class extends Error {}, prepareOrderResend: async () => { prepares++; } },
  });
  const url = 'https://www.agayo.ru/api/admin/orders/ORDER-RESEND/resend';
  const params = { params: Promise.resolve({ publicId: 'ORDER-RESEND' }) };
  const request = origin => new Request(url, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(), email: 'attacker@example.test' }) });
  assert.equal((await route.POST(request('https://evil.example.test'), params)).status, 403);
  assert.equal((await route.POST(request('https://www.agayo.ru'), params)).status, 403);
  authorize = true;
  assert.equal((await route.POST(request('https://www.agayo.ru'), params)).status, 403);
  assert.equal(prepares, 0);
});

test('authenticated POST ignores recipient and QR overrides, persists provider IDs and deduplicates the same request', async () => {
  const f = await setup(2);
  try {
    class AdminAccessError extends Error {}
    const permissions = [];
    const route = await loadTsx('../app/api/admin/orders/[publicId]/resend/route.ts', {
      '@/lib/server/admin': { AdminAccessError, requireAdminPermission: async (permission, slug) => {
        permissions.push([permission, slug]); return { userId: actor };
      } },
      '@/lib/server/db': { db: () => f.sql }, '@/lib/server/events': { getEventServer: async () => event },
      '@/lib/site': { siteOrigin: () => 'https://www.agayo.ru' }, '@/lib/server/order-ticket-resend': f.api,
    });
    const url = 'https://www.agayo.ru/api/admin/orders/ORDER-RESEND/resend';
    const params = { params: Promise.resolve({ publicId: 'ORDER-RESEND' }) };
    const requestId = randomUUID();
    const request = body => new Request(url, { method: 'POST', headers: { origin: 'https://www.agayo.ru', 'Content-Type': 'application/json' }, body });
    assert.equal((await route.POST(request('{'), params)).status, 400);
    const body = JSON.stringify({ requestId, email: 'attacker@example.test', qrToken: 'ATTACKER-QR', ticketId: 'ATTACKER-TICKET' });
    const response = await route.POST(request(body), params);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual([data.status, data.sent, data.total], ['sent', 2, 2]);
    assert.equal(JSON.stringify(data).includes('original-qr'), false);
    assert.equal((await route.POST(request(body), params)).status, 200);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call[0] === 'original-buyer@example.test' && call[1].qrToken.startsWith('original-qr-')));
    const [stored] = (await f.pg.query('SELECT results FROM ticket_resend_requests WHERE id=$1', [requestId])).rows;
    assert.ok(Object.values(stored.results).every(result => result.providerId === 'isolated-email-id'));
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 1);
    assert.ok(permissions.some(([,slug]) => slug === 'test-halloween'));
  } finally { await f.pg.close(); }
});
