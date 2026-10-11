import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
import { fixture,actor } from './database-fixture.mjs';
const { readProfileTicketPage }=await loadTs('../lib/server/profile-ticket-store.ts');
test('an older active ticket survives 60 newer used/cancelled tickets; history pages and ownership stay separate',async()=>{
  const {pg,sql}=await fixture({guests:1});
  try {
    await pg.exec(`INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES('profile-order','${actor}','test-halloween','owner@example.test','Owner','paid',300,300);
      INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,status,created_at)
      SELECT 'old-active','old-active-qr',id,user_id,event_slug,owner_name,'standard','STANDARD','valid','2020-01-01' FROM orders;
      INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,status,created_at)
      SELECT 'new-'||n,'qr-'||n,o.id,o.user_id,o.event_slug,o.owner_name,'standard','STANDARD',CASE WHEN n%2=0 THEN 'used' ELSE 'cancelled' END,'2026-01-01'::timestamptz+n*interval '1 day' FROM orders o CROSS JOIN generate_series(1,60) AS n;`);
    const first=await readProfileTicketPage(sql,actor);
    assert.equal(first.history.length,50); assert.equal(first.history.some(ticket=>ticket.public_id==='old-active'),false);
    assert.equal(first.active[0].public_id,'old-active'); assert.equal(first.activeTotal,1); assert.equal(first.visits,30); assert.equal(first.total,61);
    assert.equal((await readProfileTicketPage(sql,actor,2)).history.length,11);
    const [guest]=(await pg.query("SELECT id FROM users WHERE loyalty_level='GOLD' LIMIT 1")).rows;
    assert.equal((await readProfileTicketPage(sql,guest.id)).total,0);
  }finally{await pg.close();}
});
