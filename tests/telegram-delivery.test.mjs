import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTs, loadTsx } from './load-ts.mjs';
import { taggedSql } from './database-fixture.mjs';

const owner = '00000000-0000-0000-0000-000000000001', other = '00000000-0000-0000-0000-000000000002';
const ticketId = '00000000-0000-0000-0000-000000000003';
const security = await loadTs('../lib/server/security.ts');
const names = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
before(() => { process.env.TELEGRAM_BOT_TOKEN = '123456:ISOLATED_FAKE_TOKEN_DO_NOT_SEND'; process.env.TELEGRAM_BOT_USERNAME = 'agayo_fixture_bot'; process.env.TELEGRAM_WEBHOOK_SECRET = 'ISOLATED_WEBHOOK_SECRET_DO_NOT_SEND_12345'; });
after(() => { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text UNIQUE,telegram_chat_id text UNIQUE,updated_at timestamptz DEFAULT now());
    CREATE TABLE tickets(id uuid PRIMARY KEY,public_id text UNIQUE,user_id uuid REFERENCES users(id));
    INSERT INTO users(id,email) VALUES('${owner}','owner@example.test'),('${other}','other@example.test');
    INSERT INTO tickets(id,public_id,user_id) VALUES('${ticketId}','AGY-ISOLATED-TICKET','${owner}');`);
  await pg.exec(await readFile(new URL('../db/017_telegram_delivery.sql', import.meta.url), 'utf8'));
  const sql = taggedSql(pg);
  const telegram = await loadTsx('../lib/server/telegram.ts', { './db': { db: () => sql }, './security': security });
  async function link(userId = owner, chatId = '12345') {
    const value = await telegram.createTelegramLink(userId, sql);
    const token = new URL(value.url).searchParams.get('start');
    assert.equal(await telegram.consumeTelegramLink(token, chatId, sql), true);
    return token;
  }
  return { pg, sql, telegram, link };
}
const input = { ticketId: 'AGY-ISOLATED-TICKET', ticketUrl: 'https://www.agayo.ru/tickets/isolated-test-token', caption: 'AGAYO\nОдин билет = один вход', qrBuffer: Buffer.from('ISOLATED_QR_BYTES'), deliveryKey: 'AGAYO-ISOLATED-DELIVERY' };

test('link is hashed, expiring, single-use and accepts only the matching private Telegram user', async () => {
  const { pg, sql, telegram } = await fixture();
  try {
    assert.equal(telegram.acceptsTelegramWebhook('wrong'), false);
    assert.equal(telegram.acceptsTelegramWebhook(process.env.TELEGRAM_WEBHOOK_SECRET), true);
    const value = await telegram.createTelegramLink(owner, sql), token = new URL(value.url).searchParams.get('start');
    assert.equal(token.length, 49); assert.equal(value.expiresIn, 600);
    const [stored] = (await pg.query('SELECT token_hash,expires_at-created_at AS lifetime FROM telegram_link_tokens')).rows;
    assert.equal(stored.token_hash, security.hash(token)); assert.equal(JSON.stringify(stored).includes(token), false);
    const privateMessage = { message: { chat: { id: 12345, type: 'private' }, from: { id: 12345 }, text: `/start ${token}` } };
    assert.deepEqual(telegram.telegramStart(privateMessage), { token, chatId: '12345' });
    assert.equal(telegram.telegramStart({ message: { ...privateMessage.message, chat: { id: -12345, type: 'group' } } }), null);
    assert.equal(telegram.telegramStart({ message: { ...privateMessage.message, from: { id: 9999 } } }), null);
    assert.equal(await telegram.consumeTelegramLink(token, '12345', sql), true);
    assert.equal(await telegram.consumeTelegramLink(token, '9999', sql), false);
    assert.deepEqual(await telegram.telegramProfile(owner, sql), { available: true, linked: true, preference: 'telegram' });
    await assert.rejects(telegram.createTelegramLink(owner, sql), error => error.status === 429);
  } finally { await pg.close(); }
});

test('linking cannot steal another account chat; expiry and unlink invalidate outstanding tokens', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link();
    const value = await telegram.createTelegramLink(other, sql), token = new URL(value.url).searchParams.get('start');
    assert.equal(await telegram.consumeTelegramLink(token, '12345', sql), false);
    await pg.exec("UPDATE telegram_link_tokens SET expires_at=now()-interval '1 second'");
    assert.equal(await telegram.consumeTelegramLink(token, '9999', sql), false);
    await telegram.unlinkTelegram(owner, sql);
    assert.deepEqual(await telegram.telegramProfile(owner, sql), { available: true, linked: false, preference: 'email' });
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM telegram_link_tokens WHERE user_id=$1', [owner])).rows[0].n, 0);
    await assert.rejects(telegram.setTelegramPreference(owner, 'telegram', sql), error => error.status === 409);
  } finally { await pg.close(); }
});

test('delivery claims before I/O and a repeated successful request never sends a second Telegram document', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link(); let calls = 0, transactions = 0;
    const begin = sql.begin; sql.begin = async callback => { transactions++; try { return await begin(callback); } finally { transactions--; } };
    const fetcher = async (url, options) => {
      calls++; assert.equal(transactions, 0); assert.equal(url.endsWith('/sendDocument'), true);
      assert.equal((await pg.query('SELECT status FROM telegram_ticket_deliveries')).rows[0].status, 'sending');
      assert.equal(options.body.get('chat_id'), '12345'); assert.equal(options.body.get('caption'), input.caption);
      assert.deepEqual(Buffer.from(await options.body.get('document').arrayBuffer()), input.qrBuffer);
      assert.equal(JSON.parse(options.body.get('reply_markup')).inline_keyboard[0][0].url, input.ticketUrl);
      return Response.json({ ok: true, result: { message_id: 4321 } });
    };
    assert.deepEqual(await telegram.deliverTicketTelegram('OWNER@example.test', input, { sql, fetcher }), { handled: true });
    assert.deepEqual(await telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), { handled: true });
    assert.equal(calls, 1);
    assert.equal((await pg.query('SELECT status FROM telegram_ticket_deliveries')).rows[0].status, 'sent');
  } finally { await pg.close(); }
});

test('a definitive blocked-bot response falls back to email and never retries that Telegram request', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link(); let calls = 0;
    const fetcher = async () => { calls++; return Response.json({ ok: false, error_code: 403, description: 'blocked' }, { status: 403 }); };
    assert.deepEqual(await telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), { handled: false });
    assert.deepEqual(await telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), { handled: false });
    assert.equal(calls, 1);
    assert.equal((await pg.query('SELECT status,error_code FROM telegram_ticket_deliveries')).rows[0].status, 'failed');
  } finally { await pg.close(); }
});

test('a concurrent retry during provider I/O cannot issue a second document', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link(); let calls = 0, release, started;
    const ready = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const fetcher = async () => { calls++; started(); await gate; return Response.json({ ok: true, result: { message_id: 9876 } }); };
    const first = telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher });
    await ready;
    await assert.rejects(telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), error => error.status === 409);
    assert.equal(calls, 1); release();
    assert.deepEqual(await first, { handled: true });
    assert.equal((await pg.query('SELECT status FROM telegram_ticket_deliveries')).rows[0].status, 'sent');
  } finally { await pg.close(); }
});

test('an unknown external response is persisted, never automatically retried and never falls back as though rejected', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link(); let calls = 0;
    const fetcher = async () => { calls++; throw new Error('Simulated timeout with a sensitive provider URL'); };
    await assert.rejects(telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), error => error.status === 409 && !error.message.includes('sensitive'));
    await assert.rejects(telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), error => error.status === 409);
    assert.equal(calls, 1);
    assert.deepEqual((await pg.query('SELECT status,error_code FROM telegram_ticket_deliveries')).rows[0], { status: 'uncertain', error_code: 'response_unknown' });
  } finally { await pg.close(); }
});

test('a crashed stale claim becomes uncertain durably; an unrelated email cannot redirect a ticket', async () => {
  const { pg, sql, telegram, link } = await fixture();
  try {
    await link(); const fetcher = async () => { throw new Error('No external request allowed'); };
    assert.deepEqual(await telegram.deliverTicketTelegram('other@example.test', input, { sql, fetcher }), { handled: false });
    await pg.query("INSERT INTO telegram_ticket_deliveries(delivery_key,ticket_id,destination_chat_id,status,claimed_at) VALUES($1,$2,'12345','sending',now()-interval '3 minutes')", [input.deliveryKey, ticketId]);
    await assert.rejects(telegram.deliverTicketTelegram('owner@example.test', input, { sql, fetcher }), error => error.status === 409);
    assert.equal((await pg.query('SELECT status FROM telegram_ticket_deliveries')).rows[0].status, 'uncertain');
  } finally { await pg.close(); }
});

test('profile link requires an authenticated same-origin owner and webhook rejects missing secrets before reading body', async () => {
  let calls = 0;
  const api = await loadTsx('../app/api/profile/telegram/route.ts', {
    '@/lib/server/auth': { getCurrentUser: async () => ({ id: owner }) },
    '@/lib/server/telegram': { TelegramError: class extends Error { constructor(message, status) { super(message); this.status = status; } }, createTelegramLink: async userId => { assert.equal(userId, owner); calls++; return { url: 'https://t.me/isolated_bot?start=fixture' }; } },
  });
  const url = 'https://www.agayo.ru/api/profile/telegram';
  assert.equal((await api.POST(new Request(url, { method: 'POST', headers: { origin: 'https://evil.example.test' } }))).status, 403);
  assert.equal((await api.POST(new Request(url, { method: 'POST', headers: { origin: 'https://www.agayo.ru' } }))).status, 200);
  assert.equal(calls, 1);
  const webhook = await loadTsx('../app/api/telegram/webhook/route.ts', { '@/lib/server/telegram': { acceptsTelegramWebhook: () => false } });
  assert.equal((await webhook.POST({ headers: new Headers(), text: () => { throw new Error('Body must not be read'); } })).status, 401);
});

test('ticket sender suppresses Resend on confirmed Telegram delivery and preserves email fallback', async () => {
  const presentation = await loadTs('../lib/event-presentation.ts'), art = await loadTs('../lib/halloween-art.ts');
  let handled = true, uncertain = false, telegramCalls = 0, emailCalls = 0;
  const { sendTicketEmail } = await loadTsx('../lib/server/email.ts', { '@/lib/event-presentation': presentation, '@/lib/halloween-art': art, './telegram': { deliverTicketTelegram: async () => { telegramCalls++; if (uncertain) throw new Error('Uncertain delivery'); return { handled }; } } });
  const oldFetch = globalThis.fetch, oldKey = process.env.EMAIL_PROVIDER_API_KEY, oldFrom = process.env.EMAIL_FROM;
  process.env.EMAIL_PROVIDER_API_KEY = 'ISOLATED_DO_NOT_SEND'; process.env.EMAIL_FROM = 'fixture@example.test';
  globalThis.fetch = async url => { assert.equal(url, 'https://api.resend.com/emails'); emailCalls++; return Response.json({}); };
  try {
    const ticket = { eventTitle: 'AGAYO', eventDate: '01.01.80', eventTime: '18:00', eventCity: 'Йошкар-Ола', eventAge: '14+', alcoholFree: true, ticketId: input.ticketId, ticketUrl: input.ticketUrl, qrToken: 'ISOLATED_DO_NOT_SEND', ownerName: 'Гость', categoryName: 'STANDARD' };
    await sendTicketEmail('owner@example.test', ticket); assert.equal(emailCalls, 0);
    handled = false; await sendTicketEmail('owner@example.test', ticket); assert.equal(emailCalls, 1); assert.equal(telegramCalls, 2);
    uncertain = true; await assert.rejects(sendTicketEmail('owner@example.test', ticket), /Uncertain delivery/); assert.equal(emailCalls, 1);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.EMAIL_PROVIDER_API_KEY; else process.env.EMAIL_PROVIDER_API_KEY = oldKey; if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom; }
});
