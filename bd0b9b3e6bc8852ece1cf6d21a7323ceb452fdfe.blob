import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';
const { savePersonalCampaign, issuePersonalBatch, personalTicketDescriptions, PersonalTicketError } = await loadTs('../lib/server/personal-ticket-store.ts');
const input = { actorId: actor, eventSlug:'test-halloween', categoryId:'standard', title:'Приглашение GOLD', description:'Личный билет для своих', levels:['GOLD'] };

test('public reads never initialize personal schema; preparation selects only requested levels with email', async () => {
  const {pg,sql} = await fixture({guests:3});
  try {
    assert.equal((await personalTicketDescriptions(sql,['unknown'])).size,0);
    assert.equal((await pg.query("SELECT to_regclass('public.personal_ticket_grants') AS name")).rows[0].name,null);
    const campaign = await savePersonalCampaign(sql,input);
    assert.equal(campaign.recipients.length,3);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,0);
    assert.equal((await pg.query('SELECT action FROM admin_audit_log')).rows[0].action,'personal_ticket.prepare');
    await assert.rejects(savePersonalCampaign(sql,{...input,levels:['LEGEND']}),PersonalTicketError);
  } finally { await pg.close(); }
});

test('parallel/repeated batches issue one zero-price ticket per recipient and descriptions remain editable', async () => {
  const {pg,sql} = await fixture();
  try {
    const campaign = await savePersonalCampaign(sql,input);
    await Promise.all([issuePersonalBatch(sql,campaign.id,actor),issuePersonalBatch(sql,campaign.id,actor)]);
    assert.deepEqual(await issuePersonalBatch(sql,campaign.id,actor),{issued:0});
    const [counts] = (await pg.query('SELECT count(*)::int AS n,count(DISTINCT qr_token)::int AS qr,count(DISTINCT user_id)::int AS users FROM tickets')).rows;
    assert.deepEqual(counts,{n:15,qr:15,users:15});
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM orders WHERE status='paid' AND total=0 AND yookassa_payment_id IS NULL AND legal_accepted_at IS NULL")).rows[0].n,15);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE zone='STANDARD'")).rows[0].n,15);
    const tickets=(await pg.query('SELECT public_id FROM tickets')).rows;
    await pg.query('UPDATE personal_ticket_campaigns SET description=$1 WHERE id=$2',['Обновлённое описание',campaign.id]);
    const descriptions=await personalTicketDescriptions(sql,tickets.map(row=>row.public_id));
    assert.equal(descriptions.size,15);
    assert.equal(descriptions.get(tickets[0].public_id).description,'Обновлённое описание');
  } finally { await pg.close(); }
});

test('active paid-checkout reservations prevent gift overselling and failed issuance rolls back every row', async () => {
  const {pg,sql} = await fixture({guests:2,inventory:2});
  try {
    const campaign=await savePersonalCampaign(sql,input);
    await pg.exec(`INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,subtotal,total) VALUES('reserved','${actor}','test-halloween','owner@example.test','Owner',300,300);
      INSERT INTO ticket_inventory_reservations(order_id,event_slug,category_id,quantity) SELECT id,'test-halloween','standard',1 FROM orders WHERE public_id='reserved';`);
    await assert.rejects(issuePersonalBatch(sql,campaign.id,actor),PersonalTicketError);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,0);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,1);
    await pg.exec('UPDATE ticket_inventory_reservations SET released_at=now()');
    await issuePersonalBatch(sql,campaign.id,actor);
    const another=await savePersonalCampaign(sql,input);
    await assert.rejects(issuePersonalBatch(sql,another.id,actor),PersonalTicketError);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,2);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM personal_ticket_grants')).rows[0].n,2);
  } finally { await pg.close(); }
});

test('audit failures roll back an entire gift batch and archived events cannot issue tickets', async () => {
  const {pg,sql}=await fixture({guests:2});
  try {
    const campaign=await savePersonalCampaign(sql,input);
    await pg.exec("ALTER TABLE admin_audit_log ADD CONSTRAINT reject_issue CHECK(action <> 'personal_ticket.issue') NOT VALID");
    await assert.rejects(issuePersonalBatch(sql,campaign.id,actor));
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,0);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,0);
    await pg.exec("UPDATE events SET starts_at='2020-01-01T18:00:00Z'");
    await assert.rejects(issuePersonalBatch(sql,campaign.id,actor),PersonalTicketError);
  } finally { await pg.close(); }
});
