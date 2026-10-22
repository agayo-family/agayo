import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';

const personal = await loadTs('../lib/server/personal-ticket-store.ts');
const refunds = await loadTs('../lib/server/admin-refund-store.ts');
const security = await loadTs('../lib/server/security.ts');
const allocation = await loadTsx('../lib/server/ticket-refunds.ts',{'./db':{}});
const key = '11111111-1111-4111-8111-111111111111';
const gift = { requestId:key, actorId:actor, eventSlug:'test-halloween', categoryId:'standard', email:'new-guest@example.test', title:'Гость', description:'Приглашение' };

// Emulate postgres.js jsonb OID serialization, which a plain PGlite adapter
// misses. A string bound directly to ::jsonb is JSON-encoded by the driver.
function productionJsonSql(pg) {
  const sql = (strings,...values) => pg.sql(strings,...values.map((value,index) => /^::jsonb\b/.test(strings[index+1]) ? JSON.stringify(value) : value)).then(result=>result.rows);
  sql.unsafe = statement => pg.exec(statement);
  sql.begin = callback => pg.transaction(tx=>callback(productionJsonSql(tx)));
  return sql;
}

test('production-shaped JSON binding and legacy double-encoded campaigns prepare/issue without array errors', async () => {
  const {pg} = await fixture({guests:2}); const sql=productionJsonSql(pg);
  try {
    assert.equal((await sql`SELECT jsonb_typeof(${JSON.stringify(['GOLD'])}::jsonb) AS type`)[0].type,'string');
    const campaign=await personal.savePersonalCampaign(sql,{...gift,levels:['GOLD']});
    assert.deepEqual(campaign.levels,['GOLD']); assert.equal(campaign.recipients.length,2);
    await pg.query('UPDATE personal_ticket_campaigns SET recipients=$1::jsonb,levels=$2::jsonb WHERE id=$3', [JSON.stringify(JSON.stringify(campaign.recipients)),JSON.stringify(JSON.stringify(['GOLD'])),campaign.id]);
    await personal.issuePersonalBatch(sql,campaign.id,actor);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,2);
    assert.equal((await pg.query("SELECT jsonb_typeof(recipients) AS type FROM personal_ticket_campaigns")).rows[0].type,'array');
    assert.equal((await pg.query("SELECT jsonb_typeof(details) AS type FROM admin_audit_log LIMIT 1")).rows[0].type,'object');
  } finally { await pg.close(); }
});

test('individual gift creates an account and durable delivery once; repeated key cannot change recipient', async () => {
  const {pg,sql}=await fixture({guests:0,inventory:1});
  try {
    const first=await personal.issueIndividualTicket(sql,gift);
    const second=await personal.issueIndividualTicket(sql,gift);
    assert.equal(first.issued,true); assert.equal(second.issued,false); assert.equal(first.campaignId,second.campaignId);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM orders WHERE status='paid' AND total=0 AND yookassa_payment_id IS NULL")).rows[0].n,1);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM ticket_deliveries')).rows[0].n,1);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM users WHERE email='new-guest@example.test'")).rows[0].n,1);
    await assert.rejects(personal.issueIndividualTicket(sql,{...gift,email:'another@example.test'}),personal.PersonalTicketError);
    await assert.rejects(personal.issueIndividualTicket(sql,{...gift,requestId:'22222222-2222-4222-8222-222222222222',email:'another@example.test'}),personal.PersonalTicketError);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM users WHERE email='another@example.test'")).rows[0].n,0);
  } finally { await pg.close(); }
});

test('deleted events and audit failures cannot leave a gift/account without a committed ticket', async () => {
  const {pg,sql}=await fixture({guests:0});
  try {
    await pg.exec('ALTER TABLE events ADD COLUMN deleted_at timestamptz; UPDATE events SET deleted_at=now()');
    await assert.rejects(personal.issueIndividualTicket(sql,gift),personal.PersonalTicketError);
    await pg.exec("UPDATE events SET deleted_at=NULL; ALTER TABLE admin_audit_log ADD CONSTRAINT reject_gift CHECK(action<>'personal_ticket.issue') NOT VALID");
    await assert.rejects(personal.issueIndividualTicket(sql,gift));
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,0);
    assert.equal((await pg.query("SELECT to_regclass('public.personal_ticket_requests') AS table_name")).rows[0].table_name,null);
  } finally { await pg.close(); }
});

async function scanFixture() {
  const value=await fixture({guests:0});
  await value.pg.exec(`ALTER TABLE tickets ADD COLUMN used_by uuid;
    CREATE TABLE ticket_refunds(id uuid DEFAULT gen_random_uuid(),ticket_id uuid UNIQUE REFERENCES tickets(id),order_id uuid,refund_percent int,amount numeric,status text,reason text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),yookassa_refund_id text,succeeded_at timestamptz);
    INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total) VALUES('AGY-1234567890','${actor}','test-halloween','owner@example.test','Гость','paid',600,600);
    INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name)
      SELECT 'TKT-123456789' || n,'secret-qr-token-123456789-' || n,id,'${actor}','test-halloween','Гость ' || n,'standard','STANDARD' FROM orders,generate_series(0,1) AS n;`);
  return value;
}
class AdminAccessError extends Error { constructor(message,status=403){super(message);this.status=status;} }
const fullActor={userId:actor,role:'owner',allEvents:true,eventSlugs:[]};
async function scanApi(sql,requireAdminPermission=async()=>fullActor) {
  return loadTsx('../app/api/admin/tickets/scan/route.ts', {
    '@/lib/server/db':{db:()=>sql},'@/lib/server/admin':{AdminAccessError,requireAdminPermission,canAccessEvent:(access,slug)=>access.allEvents||access.eventSlugs.includes(slug)},
    '@/lib/server/loyalty':{updateUserLoyaltyByVisits:async()=>{}},
  });
}
const scanRequest=token=>new Request('https://example.test/api/admin/tickets/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});

test('manual order opens a ticket chooser; short public ticket number and QR share one atomic pass result', async () => {
  const {pg,sql}=await scanFixture();
  try {
    const {POST}=await scanApi(sql);
    const order=await (await POST(scanRequest('AGY-1234567890'))).json();
    assert.equal(order.result,'choose_ticket'); assert.equal(order.tickets.length,2);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE status='used'")).rows[0].n,0);
    const responses=await Promise.all([POST(scanRequest('TKT-1234567890')),POST(scanRequest('secret-qr-token-123456789-0'))]);
    assert.deepEqual((await Promise.all(responses.map(response=>response.json()))).map(body=>body.result).sort(),['accepted','already_used']);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE status='valid'")).rows[0].n,1);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM admin_audit_log WHERE action='ticket.scan'")).rows[0].n,1);
    assert.equal((await (await POST(scanRequest('x'))).json()).result,'not_found');
  } finally { await pg.close(); }
});

test('manual lookup respects permission and event scope without disclosing order tickets', async () => {
  const {pg,sql}=await scanFixture();
  try {
    const scoped=await scanApi(sql,async()=>({...fullActor,role:'controller',allEvents:false,eventSlugs:[]}));
    assert.equal((await scoped.POST(scanRequest('AGY-1234567890'))).status,404);
    assert.equal((await scoped.POST(scanRequest('TKT-1234567890'))).status,403);
    const restricted=await scanApi(sql,async permission=>{if(permission==='manual_ticket_search')throw new AdminAccessError('Нет ручного поиска');return fullActor;});
    assert.equal((await restricted.POST(scanRequest('TKT-1234567890'))).status,403);
    assert.equal((await (await restricted.POST(scanRequest('secret-qr-token-123456789-0'))).json()).result,'accepted');
  } finally { await pg.close(); }
});

async function refundInput(pg, ticket=true) {
  const [row]=(await pg.query('SELECT t.id AS ticket_id,t.order_id FROM tickets t ORDER BY t.public_id LIMIT 1')).rows;
  return {orderId:row.order_id,ticketId:ticket?row.ticket_id:null,actorId:actor,reason:'Подтверждённое основание',payload:{paymentId:'isolated-payment',amount:150,percent:50,partial:true,description:'Возврат синтетического билета'}};
}

test('unknown refund freezes payload/key, blocks pass, and retries without a second financial intent', async () => {
  const {pg,sql}=await scanFixture();
  try {
    const input=await refundInput(pg);
    const intent=await refunds.prepareAdminRefund(sql,input);
    let calls=0;const keys=[];
    const provider={create:async payload=>{calls++;keys.push(payload.idempotenceKey);assert.equal(payload.amount,150);if(calls===1)throw new Error('lost provider response');return{id:'synthetic-refund',status:'succeeded'};},sync:async()=>({state:'partial_refund'})};
    assert.equal((await refunds.runAdminRefund(sql,intent,provider)).state,'unknown');
    assert.equal((await (await (await scanApi(sql)).POST(scanRequest('TKT-1234567890'))).json()).result,'invalid');
    assert.equal((await pg.query("SELECT status FROM tickets WHERE id=$1",[input.ticketId])).rows[0].status,'valid');
    const resumed=await refunds.prepareAdminRefund(sql,{...input,payload:{...input.payload,amount:300,percent:100}});
    assert.equal(resumed.request_payload.amount,150);
    assert.equal((await refunds.runAdminRefund(sql,resumed,provider)).state,'partial_refund');
    await refunds.runAdminRefund(sql,resumed,provider);
    assert.equal(calls,2);assert.equal(keys[0],keys[1]);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM admin_refund_requests')).rows[0].n,1);
  } finally { await pg.close(); }
});

test('expired unknown idempotency never sends money again; another ticket/order refund cannot overlap', async () => {
  const {pg,sql}=await scanFixture();
  try {
    const input=await refundInput(pg);
    const intent=await refunds.prepareAdminRefund(sql,input);
    await assert.rejects(refunds.prepareAdminRefund(sql,{...input,ticketId:null}),refunds.AdminRefundError);
    await pg.query("UPDATE admin_refund_requests SET first_attempt_at=now()-interval '24 hours' WHERE id=$1",[intent.id]);
    let calls=0;
    await assert.rejects(refunds.runAdminRefund(sql,intent,{create:async()=>{calls++;throw new Error('never');},sync:async()=>{throw new Error('never');}}),refunds.AdminRefundError);
    assert.equal(calls,0);
  } finally { await pg.close(); }
});

async function refundProcessor(sql,payment,refund) {
  return loadTsx('../lib/server/payment-processing.ts', { './email-transport': await loadTsx('../lib/server/email-transport.ts'),
    '@/lib/server/db':{db:()=>sql},'@/lib/server/events':{},'@/lib/server/email':{},
    '@/lib/server/yookassa':{getPayment:async()=>payment,getRefund:async()=>refund},'@/lib/server/security':security,
    '@/lib/server/loyalty':{updateUserLoyaltyByVisits:async()=>{}},'@/lib/server/npd':{markNpdAfterRefund:async()=>{}},
  });
}

test('authoritative canceled refund reopens admission; a stale succeeded webhook never lowers refund totals', async () => {
  const {pg,sql}=await scanFixture();
  try {
    await pg.exec("ALTER TABLE orders ADD COLUMN refunded_amount numeric(12,2) DEFAULT 0, ADD COLUMN refunded_at timestamptz; UPDATE orders SET yookassa_payment_id='isolated-payment'");
    const input=await refundInput(pg);
    const intent=await refunds.prepareAdminRefund(sql,input);
    const payment={id:'isolated-payment',status:'succeeded',paid:true,amount:{value:'600.00',currency:'RUB'},refunded_amount:{value:'0.00',currency:'RUB'}};
    const canceled={id:'synthetic-canceled',payment_id:payment.id,status:'canceled',amount:{value:'150.00',currency:'RUB'}};
    const processor=await refundProcessor(sql,payment,canceled);
    let creates=0;
    const provider={create:async()=>{creates++;return canceled;},sync:processor.syncYooKassaRefund};
    assert.equal((await refunds.runAdminRefund(sql,intent,provider)).state,'canceled');
    assert.equal((await refunds.runAdminRefund(sql,intent,provider)).state,'canceled');
    assert.equal(creates,1);
    assert.equal((await (await (await scanApi(sql)).POST(scanRequest('TKT-1234567890'))).json()).result,'accepted');
    await pg.exec("UPDATE tickets SET status='valid',used_at=NULL; UPDATE ticket_refunds SET yookassa_refund_id='synthetic-succeeded',status='pending',reason='customer_return'; UPDATE orders SET refunded_amount=600,status='refunded'");
    payment.refunded_amount.value='150.00';
    const succeeded={...canceled,id:'synthetic-succeeded',status:'succeeded'};
    const stale=await refundProcessor(sql,payment,succeeded);
    assert.equal((await stale.syncYooKassaRefund(succeeded.id)).state,'refunded');
    assert.equal(Number((await pg.query('SELECT refunded_amount FROM orders')).rows[0].refunded_amount),600);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM tickets WHERE status='refunded'")).rows[0].n,2);
  } finally { await pg.close(); }
});

test('late pending reply cannot overwrite a succeeded webhook and refunded shares allocate every kopeck once', async () => {
  const shares=allocation.allocatePaidShares([{id:'1',category_id:'same'},{id:'2',category_id:'same'},{id:'3',category_id:'same'}],[{ticket_category_id:'same',unit_price:500}],1000,1500);
  assert.deepEqual([...shares.values()],[333.33,333.33,333.34]);
  assert.equal(Math.round([...shares.values()].reduce((sum,value)=>sum+value,0)*100),100000);
  const {pg,sql}=await scanFixture();
  try {
    const intent=await refunds.prepareAdminRefund(sql,await refundInput(pg));
    const result=await refunds.runAdminRefund(sql,intent,{create:async()=>({id:'synthetic-race',status:'pending'}),sync:async()=>{
      await pg.query("UPDATE admin_refund_requests SET status='succeeded' WHERE id=$1",[intent.id]);
      return {state:'pending'};
    }});
    assert.equal(result.state,'partial_refund');
    assert.equal((await pg.query('SELECT status FROM admin_refund_requests')).rows[0].status,'succeeded');
  } finally { await pg.close(); }
});

test('a webhook arriving before the create response stays final even when the follow-up read fails',async()=>{
  const {pg,sql}=await scanFixture();
  try {
    const input=await refundInput(pg),intent=await refunds.prepareAdminRefund(sql,input);
    const result=await refunds.runAdminRefund(sql,intent,{create:async()=>{
      await pg.query("UPDATE admin_refund_requests SET status='succeeded' WHERE id=$1",[intent.id]);
      await pg.query("UPDATE ticket_refunds SET status='succeeded' WHERE ticket_id=$1",[input.ticketId]);
      return {id:'synthetic-early-webhook',status:'succeeded'};
    },sync:async()=>{throw new Error('follow-up network failure');}});
    assert.equal(result.state,'partial_refund');
    assert.equal((await pg.query('SELECT status FROM admin_refund_requests')).rows[0].status,'succeeded');
    assert.equal((await pg.query('SELECT status FROM ticket_refunds')).rows[0].status,'succeeded');
  }finally{await pg.close();}
});
