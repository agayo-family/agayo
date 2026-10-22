import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, taggedSql } from './database-fixture.mjs';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

const transport = await loadTsx('../lib/server/email-transport.ts');
const security = await loadTs('../lib/server/security.ts');
const checkout = await loadTs('../lib/checkout-status.ts');
const event = { slug: 'test-halloween', title: 'AGAYO', dateLabel: '01.11.80', timeLabel: '18:00', city: 'Йошкар-Ола', ageLabel: '14+', tickets: [] };

async function withEmail(callback) {
  const before = { key: process.env.EMAIL_PROVIDER_API_KEY, from: process.env.EMAIL_FROM };
  process.env.EMAIL_PROVIDER_API_KEY = 're_ISOLATED_SECRET_DO_NOT_SEND';
  process.env.EMAIL_FROM = 'AGAYO <tickets@example.test>';
  try { await callback(); } finally {
    for (const [name, value] of [['EMAIL_PROVIDER_API_KEY', before.key], ['EMAIL_FROM', before.from]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('configured sandbox sender is never presented as production ready; whitespace is trimmed', () => withEmail(async () => {
  process.env.EMAIL_FROM = ' AGAYO <onboarding@resend.dev> ';
  assert.equal(transport.emailConfiguration().configured, true);
  assert.equal(transport.emailConfiguration().productionReady, false);
  assert.equal(transport.emailConfiguration().sandbox, true);
  process.env.EMAIL_FROM = 'not-an-address';
  assert.equal(transport.emailConfiguration().configured, false);
}));

test('rate limit retries identical body/key, honors Retry-After and requires a provider message ID', () => withEmail(async () => {
  const calls = [], waits = [];
  const result = await transport.sendProviderEmail({ to: ['guest@example.test'], subject: 'Isolated', html: '<p>Ticket</p>' }, 'ISOLATED-KEY', {
    fetcher: async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails'); calls.push(options);
      return calls.length === 1 ? Response.json({ name: 'rate_limit_exceeded' }, { status: 429, headers: { 'Retry-After': '1.5' } }) : Response.json({ id: 'isolated-provider-id' });
    }, sleep: async ms => { waits.push(ms); },
  });
  assert.equal(result.providerId, 'isolated-provider-id');
  assert.equal(calls.length, 2); assert.deepEqual(waits, [1500]);
  assert.equal(calls[0].body, calls[1].body); assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
}));

test('lost response retries its original key, but unverified sender, quota and payload conflicts are not blindly repeated', () => withEmail(async () => {
  const keys = []; let calls = 0;
  await transport.sendProviderEmail({ html: 'Isolated' }, undefined, { fetcher: async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']); if (++calls === 1) throw new Error('re_MUST_NOT_LEAK guest@example.test');
    return Response.json({ id: 'isolated-id' });
  }, sleep: async () => {} });
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  for (const [status, name, message, code] of [
    [403, 'validation_error', 'You can only send testing emails to your own email address (private@example.test)', 'test_domain'],
    [403, 'validation_error', 'The example.test domain is not verified', 'unverified_domain'],
    [429, 'daily_quota_exceeded', 'limit', 'daily_quota_exceeded'],
    [409, 'invalid_idempotent_request', 'different body', 'invalid_idempotent_request'],
  ]) {
    let count = 0;
    await assert.rejects(transport.sendProviderEmail({ html: 'Isolated' }, 'ISOLATED', { fetcher: async () => {
      count++; return Response.json({ name, message }, { status });
    }, sleep: async () => { assert.fail('Permanent failure must not sleep'); } }), error => {
      assert.equal(error.code, code); assert.equal(error.message.includes('private@example.test'), false); return true;
    });
    assert.equal(count, 1);
  }
}));

test('a 2xx without an email ID remains unconfirmed and a long Retry-After does not block a Function', () => withEmail(async () => {
  let count = 0;
  await assert.rejects(transport.sendProviderEmail({}, 'ISOLATED', { fetcher: async () => { count++; return Response.json({}); }, sleep: async () => {} }), { code: 'invalid_response' });
  assert.equal(count, 2);
  await assert.rejects(transport.sendProviderEmail({}, 'ISOLATED', { fetcher: async () => Response.json({ name: 'rate_limit_exceeded' }, { status: 429, headers: { 'Retry-After': '60' } }), sleep: async () => assert.fail('Must defer long waits') }), { code: 'rate_limit_exceeded' });
  assert.equal(transport.emailErrorMessage(new Error('Bearer re_SECRET /tickets/private guest@example.test')).includes('re_SECRET'), false);
  assert.equal(transport.explainStoredEmailError('Email provider error: 403 · private@example.test only send testing').code, 'test_domain');
}));

test('expired ambiguous results never send again after the provider idempotency window', () => {
  const created_at = new Date(Date.now()-25*3600000).toISOString();
  for (const last_error of [null, '[email:network] lost response', '[email:invalid_response] unknown', '[email:provider:500] unknown']) {
    assert.throws(() => transport.assertEmailRetrySafe({ status: 'failed', created_at, last_error }), { code: 'idempotency_expired' });
  }
  assert.doesNotThrow(() => transport.assertEmailRetrySafe({ status: 'failed', created_at, last_error: '[email:daily_quota_exceeded:429] rejected' }));
  assert.throws(() => transport.assertEmailRetrySafe({ status: 'failed', created_at: new Date(), last_error: '[email:invalid_idempotent_request:409] conflict' }), { code: 'invalid_idempotent_request' });
});

test('paid checkout continues polling until every issued ticket is accepted, including missing delivery rows', () => {
  const order = { status: 'paid', ticketCount: 2, delivery: { total: 2, sent: 0, failed: 2 } };
  assert.equal(checkout.needsOrderStatusRefresh(order), true);
  assert.equal(checkout.needsOrderStatusRefresh({ ...order, delivery: { total: 0, sent: 0, failed: 0 } }), true);
  assert.equal(checkout.needsOrderStatusRefresh({ ...order, delivery: { total: 2, sent: 2, failed: 0 } }), false);
  assert.equal(checkout.needsOrderStatusRefresh({ ...order, status: 'refunded' }), false);
});

async function processor(sql, sendTicketEmail) {
  return loadTsx('../lib/server/payment-processing.ts', {
    '@/lib/server/db': { db: () => sql }, '@/lib/server/events': { getEventServer: async () => event },
    '@/lib/server/email': { sendTicketEmail }, '@/lib/server/yookassa': {}, '@/lib/server/security': security,
    '@/lib/server/loyalty': {}, '@/lib/server/npd': {}, './email-transport': transport,
  });
}

async function paidOrder(pg, quantity = 1) {
  const [order] = (await pg.query("INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) SELECT 'ORDER-ISOLATED',id,'test-halloween',email,'Гость','paid',300,300 FROM users LIMIT 1 RETURNING *")).rows;
  for (let i = 0; i < quantity; i++) await pg.query("INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name) VALUES($1,$2,$3,$4,'test-halloween','Гость','standard','STANDARD')", [`TKT-ISOLATED-${i}`, `isolated-token-${i}`, order.id, order.user_id]);
  return order;
}

test('failed paid delivery stays recoverable, retries the same ticket and never resends a successful ticket', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const order = await paidOrder(pg, 2); let calls = 0; const keys = [];
    const api = await processor(sql, async (_to, input) => {
      keys.push(input.deliveryKey); calls++;
      if (calls === 1) throw new transport.EmailDeliveryError('rate_limit_exceeded', 429, true);
    });
    await assert.rejects(api.deliverOrderTickets(order, event, 'https://www.agayo.ru'));
    assert.deepEqual((await pg.query('SELECT status FROM ticket_deliveries ORDER BY status')).rows.map(row => row.status), ['failed', 'sent']);
    await api.retryOrderTicketDelivery(order.public_id, 'https://www.agayo.ru');
    await api.retryOrderTicketDelivery(order.public_id, 'https://www.agayo.ru');
    assert.equal(calls, 3); assert.equal(keys[0], keys[2]);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM tickets')).rows[0].count, 2);
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM ticket_deliveries WHERE status='sent'")).rows[0].count, 2);
  } finally { await pg.close(); }
});

test('diagnostics find failed and never-attempted paid tickets while excluding refunds and private provider text', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const order = await paidOrder(pg, 2);
    await pg.exec("INSERT INTO ticket_deliveries(ticket_id,channel,destination,status,last_error) SELECT id,'email','guest@example.test','failed','Email provider error: 403 only send testing private@example.test re_PRIVATE' FROM tickets LIMIT 1");
    const api = await loadTsx('../lib/server/ticket-delivery-recovery.ts', { './db': { db: () => sql }, './email-transport': transport, './events': {}, './payment-processing': {}, './personal-ticket-delivery': {} });
    const data = await api.ticketDeliveryDiagnostics();
    assert.deepEqual(data.counts, { total: 2, accepted: 0, failed: 1, pending: 1 });
    assert.equal(JSON.stringify(data).includes('private@example.test'), false); assert.equal(JSON.stringify(data).includes('re_PRIVATE'), false);
    await pg.query("UPDATE orders SET status='refunded' WHERE id=$1", [order.id]);
    assert.equal((await api.ticketDeliveryDiagnostics()).counts.total, 0);
  } finally { await pg.close(); }
});

test('delivery diagnostics are restricted, cross-origin retries cannot send, and cron fails closed without its secret', async () => {
  class AdminAccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
  let diagnosticsCalls = 0;
  const admin = await loadTsx('../app/api/admin/system/email/route.ts', {
    '@/lib/server/admin': { AdminAccessError, requireAdminPermission: async () => { throw new AdminAccessError('Forbidden'); } },
    '@/lib/server/db': {}, '@/lib/server/ticket-delivery-recovery': { ticketDeliveryDiagnostics: async () => { diagnosticsCalls++; } }, '@/lib/site': {},
  });
  assert.equal((await admin.GET()).status, 403);
  assert.equal((await admin.POST(new Request('https://www.agayo.ru/api/admin/system/email', { method: 'POST', headers: { origin: 'https://evil.example.test' } }))).status, 403);
  assert.equal(diagnosticsCalls, 0);
  const secret = process.env.CRON_SECRET; let recoveries = 0;
  try {
    const cron = await loadTsx('../app/api/cron/ticket-delivery/route.ts', { '@/lib/server/security': security, '@/lib/server/ticket-delivery-recovery': { recoverTicketDeliveries: async () => { recoveries++; return {}; } }, '@/lib/site': { siteOrigin: () => 'https://www.agayo.ru' } });
    delete process.env.CRON_SECRET;
    assert.equal((await cron.GET(new Request('https://www.agayo.ru/api/cron/ticket-delivery'))).status, 503);
    process.env.CRON_SECRET = 'ISOLATED_STRONG_CRON_SECRET_DO_NOT_SEND';
    assert.equal((await cron.GET(new Request('https://www.agayo.ru/api/cron/ticket-delivery'))).status, 401);
    assert.equal(recoveries, 0);
    assert.equal((await cron.GET(new Request('https://www.agayo.ru/api/cron/ticket-delivery', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status, 200);
    assert.equal(recoveries, 1);
  } finally { if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret; }
});


test('readiness checks the real 001–018 schema and names a missing current migration', async () => {
  const pg = new PGlite(); const before = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'ISOLATED_DO_NOT_CONNECT';
  try {
    for (const filename of (await readdir(new URL('../db/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
      await pg.exec((await readFile(new URL(`../db/${filename}`, import.meta.url), 'utf8')).replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, ''));
    }
    const sql = taggedSql(pg);
    const api = await loadTsx('../lib/server/system-status.ts', {
      './db': { db: () => sql }, './blob': { resolveBlobToken: () => null }, './sms': { isSmsConfigured: () => false },
      './yookassa': { isReceiptConfigurationReady: () => false, isYooKassaConfigured: () => false }, './email-transport': transport,
    });
    const status = await api.getSystemStatus();
    assert.equal(status.database.reachable, true); assert.equal(status.database.schemaReady, true);
    assert.deepEqual(status.database.missingMigrations, []);
    await pg.exec('DROP TABLE site_pages');
    const changed = await api.getSystemStatus();
    assert.equal(changed.database.reachable, true); assert.equal(changed.database.schemaReady, false);
    assert.deepEqual(changed.database.missingMigrations, ['012']);
  } finally { await pg.close(); if (before === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = before; }
});

test('a refunded delivered ticket cannot mask a failed valid ticket on the paid success page', async () => {
  const { pg, sql } = await fixture({ guests: 0 });
  try {
    const order = await paidOrder(pg, 2);
    await pg.exec('ALTER TABLE orders ADD COLUMN refunded_at timestamptz, ADD COLUMN refunded_amount integer DEFAULT 0');
    await pg.exec("UPDATE tickets SET status='refunded' WHERE public_id='TKT-ISOLATED-0'; INSERT INTO ticket_deliveries(ticket_id,channel,destination,status) SELECT id,'email','guest@example.test',CASE WHEN status='refunded' THEN 'sent' ELSE 'failed' END FROM tickets");
    const route = await loadTsx('../app/api/orders/[publicId]/status/route.ts', {
      '@/lib/server/db': { db: () => sql }, '@/lib/server/payment-processing': { retryOrderTicketDelivery: async () => false },
    });
    const response = await route.GET(new Request(`https://www.agayo.ru/api/orders/${order.public_id}/status`), { params: Promise.resolve({ publicId: order.public_id }) });
    assert.equal(response.status, 200); const data = await response.json();
    assert.equal(data.ticketCount, 1); assert.deepEqual(data.delivery, { total: 1, sent: 0, failed: 1 });
    assert.equal(checkout.needsOrderStatusRefresh(data), true);
  } finally { await pg.close(); }
});

test('personal recovery retains provider failure details, frozen description and the requested order scope', async () => {
  const { pg, sql } = await fixture({ guests: 2 });
  try {
    const store = await loadTs('../lib/server/personal-ticket-store.ts');
    const campaign = await store.savePersonalCampaign(sql, { actorId: '00000000-0000-0000-0000-000000000001', eventSlug: 'test-halloween', categoryId: 'standard', title: 'Для своих', description: 'Именное приглашение', levels: ['GOLD'] });
    await store.issuePersonalBatch(sql, campaign.id, '00000000-0000-0000-0000-000000000001');
    const [order] = (await pg.query('SELECT id FROM orders LIMIT 1')).rows;
    const inputs = []; let reject = true;
    const api = await loadTsx('../lib/server/personal-ticket-delivery.ts', {
      './db': { db: () => sql }, './email-transport': transport,
      './email': { sendTicketEmail: async (_to, input) => { inputs.push(input); if (reject) throw new transport.EmailDeliveryError('test_domain', 403); } },
    });
    const withPoster = { ...event, heroImage: '/poster.jpg' };
    assert.equal((await api.deliverPersonalBatch(campaign.id, withPoster, 'https://www.agayo.ru', order.id)).failed, 1);
    assert.match((await pg.query("SELECT last_error FROM ticket_deliveries WHERE status='failed'")).rows[0].last_error, /test_domain/);
    reject = false;
    assert.equal((await api.deliverPersonalBatch(campaign.id, { ...withPoster, title: 'Changed event' }, 'https://www.agayo.ru', order.id)).sent, 1);
    assert.equal(inputs[0].deliveryKey, inputs[1].deliveryKey); assert.equal(inputs[1].eventTitle, inputs[0].eventTitle);
    assert.equal(inputs[1].personalDescription, 'Именное приглашение');
    const counts = (await pg.query("SELECT count(*) FILTER (WHERE status='sent')::int AS sent,count(*) FILTER (WHERE status='pending')::int AS pending FROM ticket_deliveries")).rows[0];
    assert.deepEqual(counts, { sent: 1, pending: 1 });
  } finally { await pg.close(); }
});

test('an ambiguous first response is not forgotten when its retry receives a definitive rejection', () => withEmail(async () => {
  let calls = 0;
  await assert.rejects(transport.sendProviderEmail({}, 'ISOLATED', { fetcher: async () => {
    if (++calls === 1) throw new Error('response lost');
    return Response.json({ name: 'daily_quota_exceeded' }, { status: 429 });
  }, sleep: async () => {} }), error => {
    const last_error = transport.emailErrorMessage(error);
    assert.match(last_error, /\[email:ambiguous\]/);
    assert.throws(() => transport.assertEmailRetrySafe({ status: 'failed', created_at: new Date(Date.now()-25*3600000), last_error }), { code: 'idempotency_expired' });
    return true;
  });
}));
