import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export const actor = '00000000-0000-0000-0000-000000000001';
export function taggedSql(pg) {
  const sql = async (strings, ...values) => (await pg.sql(strings, ...values)).rows;
  sql.begin = callback => pg.transaction(tx => callback(taggedSql(tx)));
  sql.unsafe = statement => pg.exec(statement);
  return sql;
}
export async function fixture({ guests = 15, inventory = 30 } = {}) {
  const pg = new PGlite();
  for (const file of ['001_init.sql','003_events.sql','005_event_inventory.sql','006_legal_checkout.sql','007_media.sql']) {
    const source = await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8');
    await pg.exec(source.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, ''));
  }
  await pg.exec(`CREATE TABLE admin_audit_log(actor_user_id uuid REFERENCES users(id),action text,target_type text,target_id text,details jsonb);
    INSERT INTO users(id,email,loyalty_level) VALUES('${actor}','owner@example.test','NEW');
    INSERT INTO events(slug,title,starts_at,status,sales_state,ticket_mode) VALUES('test-halloween','AGAYO HALLOWEEN','2080-11-01T18:00:00Z','published','open','zones');
    INSERT INTO event_ticket_categories(event_id,category_key,name,price,inventory) SELECT id,'standard','STANDARD',300,${inventory} FROM events WHERE slug='test-halloween';`);
  await pg.query("INSERT INTO users(email,display_name,loyalty_level) SELECT 'guest-' || n || '@example.test','Гость ' || n,'GOLD' FROM generate_series(1,$1) AS n", [guests]);
  return { pg, sql: taggedSql(pg) };
}
