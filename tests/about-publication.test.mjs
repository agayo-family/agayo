import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture as databaseFixture, actor } from './database-fixture.mjs';
import { postgresDriverSql } from './postgres-driver-sql.mjs';

const contentModule = await loadTs('../lib/about-content.ts');
const store = await loadTs('../lib/server/site-content-store.ts');
class AdminAccessError extends Error { constructor(message = 'Недостаточно прав', status = 403) { super(message); this.status = status; } }
async function api(sql, allow, invalidated = []) {
  const getAboutPageServer = async () => {
    const row = await store.readSitePage(sql, 'about');
    return row ? { content: contentModule.parseAboutContent(row.content), version: Number(row.version), updatedAt: row.updated_at } : { content: contentModule.defaultAboutContent, version: 0, updatedAt: null };
  };
  return loadTsx('../app/api/admin/about/route.ts', {
    '@/lib/about-content': contentModule, '@/lib/server/site-content-store': store,
    '@/lib/server/db': { db: () => sql }, '@/lib/server/admin': { AdminAccessError, requireAdminPermission: allow },
    '@/lib/server/about': { getAboutPageServer }, '@/lib/server/public-content': { invalidatePublicContent: key => invalidated.push(key) },
  });
}
const portrait = 'https://fgl49tcnktrldw67.public.blob.vercel-storage.com/agayo/uploads/organizer/phone-portrait.webp';
const request = (content, version = 0, origin = 'https://example.test') => new Request('https://example.test/api/admin/about', { method: 'PATCH', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ content, version }) });

test('a managed portrait publishes through the authenticated API and survives a fresh editor load', async () => {
  const { pg } = await databaseFixture({ guests: 0 });
  try {
    const invalidated = [];
    const { PATCH, GET } = await api(postgresDriverSql(pg), async permission => { assert.equal(permission, 'manage_about'); return { userId: actor }; }, invalidated);
    const content = { ...contentModule.defaultAboutContent, organizers: [{ id: 'organizer', name: 'Команда AGAYO', role: 'Организация', description: '', photoUrl: portrait, photoAlt: 'Портрет', visible: true }] };
    const response = await PATCH(request(content));
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.version, 1); assert.equal(saved.content.organizers[0].photoUrl, portrait);
    assert.deepEqual((await (await GET()).json()).content, saved.content);
    assert.deepEqual(invalidated, ['about']);
    const conflicting = await PATCH(request({ ...content, title: 'Старое окно' }, 0));
    assert.equal(conflicting.status, 409);
    assert.equal((await (await GET()).json()).content.title, saved.content.title);
  } finally { await pg.close(); }
});

test('missing About permission or a foreign origin cannot initialize or publish page data', async () => {
  const { pg } = await databaseFixture({ guests: 0 });
  try {
    const sql = postgresDriverSql(pg);
    const denied = await api(sql, async () => { throw new AdminAccessError(); });
    assert.equal((await denied.PATCH(request(contentModule.defaultAboutContent))).status, 403);
    let authorizationCalls = 0;
    const allowed = await api(sql, async () => { authorizationCalls++; return { userId: actor }; });
    assert.equal((await allowed.PATCH(request(contentModule.defaultAboutContent, 0, 'https://foreign.test'))).status, 403);
    assert.equal(authorizationCalls, 0);
    assert.equal((await pg.query("SELECT to_regclass('public.site_pages') AS name")).rows[0].name, null);
  } finally { await pg.close(); }
});
