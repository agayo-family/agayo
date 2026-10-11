import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './load-ts.mjs';
const { readSitePage, saveSitePage, ContentConflictError } = await loadTs('../lib/server/site-content-store.ts');

// Exercise the actual SQL on PostgreSQL, rather than returning canned rows.
function taggedSql(pg) {
  const sql = async (strings, ...values) => (await pg.sql(strings, ...values)).rows;
  sql.begin = (callback) => pg.transaction((tx) => callback(taggedSql(tx)));
  return sql;
}
const actor = '00000000-0000-0000-0000-000000000001';
async function database() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE users (id uuid PRIMARY KEY);
    INSERT INTO users(id) VALUES ('${actor}');
    CREATE TABLE admin_audit_log (actor_user_id uuid REFERENCES users(id), action text, target_type text, target_id text, details jsonb);`);
  return pg;
}

test('public reads do not create schema; first save initializes and persists an audited page', async () => {
  const pg = await database();
  try {
    const sql = taggedSql(pg);
    assert.equal(await readSitePage(sql, 'about'), null);
    assert.equal((await pg.query("SELECT to_regclass('public.site_pages') AS table_name")).rows[0].table_name, null);
    const content = { title: 'AGAYO', organizers: [{ id: 'first', visible: false }] };
    const result = await saveSitePage(sql, 'about', content, 0, actor);
    assert.equal(result.version, 1);
    assert.deepEqual((await readSitePage(sql, 'about')).content, content);
    const audits = (await pg.query('SELECT action,target_id,details FROM admin_audit_log')).rows;
    assert.deepEqual(audits, [{ action: 'site.page.publish', target_id: 'about', details: { version: 1 } }]);
    await assert.rejects(saveSitePage(sql, 'about', { title: 'stale' }, 0, actor), ContentConflictError);
    assert.equal((await readSitePage(sql, 'about')).content.title, 'AGAYO');
  } finally { await pg.close(); }
});

test('two editors cannot silently overwrite each other and failed audits roll back the edit', async () => {
  const pg = await database();
  try {
    await pg.exec(await readFile(new URL('../db/012_site_content.sql', import.meta.url), 'utf8'));
    const sql = taggedSql(pg);
    await saveSitePage(sql, 'about', { title: 'Original' }, 0, actor);
    const results = await Promise.allSettled([
      saveSitePage(sql, 'about', { title: 'Editor A' }, 1, actor),
      saveSitePage(sql, 'about', { title: 'Editor B' }, 1, actor),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof ContentConflictError).length, 1);
    const current = await readSitePage(sql, 'about');
    assert.equal(current.version, 2);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n, 2);
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_test_audit CHECK (action <> 'site.page.publish') NOT VALID");
    await assert.rejects(saveSitePage(sql, 'about', { title: 'Must roll back' }, 2, actor));
    assert.deepEqual(await readSitePage(sql, 'about'), current);
  } finally { await pg.close(); }
});
