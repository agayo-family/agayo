import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs,loadTsx} from './load-ts.mjs';
import {fixture} from './database-fixture.mjs';
const security=await loadTs('../lib/server/security.ts');
const lifecycle=await loadTs('../lib/events.ts');
const input=await loadTs('../lib/order-input.ts');
const yookassa=await loadTs('../lib/server/yookassa.ts');
const event={...lifecycle.events[0],slug:'test-halloween',title:'AGAYO HALLOWEEN',status:'published',salesState:'open',startsAt:'2080-11-01T18:00:00Z',tickets:[{id:'standard',name:'STANDARD',price:300}]};
const request=()=>new Request('https://www.agayo.ru/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventSlug:event.slug,categoryId:'standard',quantity:1,email:'owner@example.test',name:'Сергей',acceptedDocuments:true,acceptedPrivacy:true})});

test('only definitive rejected creation responses can cancel an order; network/5xx/storage errors stay unknown',()=>{
  for(const status of [400,401,403,404]) assert.equal(yookassa.isDefinitivePaymentFailure(new yookassa.YooKassaApiError('Rejected',status,false)),true);
  for(const error of [new Error('database write failed'),new yookassa.YooKassaApiError('lost response',null,true),new yookassa.YooKassaApiError('busy',429,true),new yookassa.YooKassaApiError('unknown',500,true)]) assert.equal(yookassa.isDefinitivePaymentFailure(error),false);
});

async function route(sql,createPayment){
  return loadTsx('../app/api/orders/route.ts',{'@/lib/server/db':{db:()=>sql},'@/lib/server/events':{getEventServer:async()=>event},'@/lib/events':lifecycle,'@/lib/server/security':security,'@/lib/server/yookassa':{...yookassa,createPayment,isYooKassaConfigured:()=>true,isReceiptConfigurationReady:()=>true},'@/lib/legal':{DEFAULT_EVENT_RULES:'Правила',LEGAL_VERSION:'fixture'},'@/lib/order-input':input});
}
test('lost provider response retains inventory, late succeeded webhook issues once and email I/O occurs outside SQL transactions',async()=>{
  const {pg,sql}=await fixture({guests:1});
  const flag=process.env.PAYMENTS_ENABLED;process.env.PAYMENTS_ENABLED='1';
  try {
    await pg.exec('CREATE TABLE promo_code_reservations(order_id uuid,promo_code_id uuid,consumed_at timestamptz,released_at timestamptz)');
    const {POST}=await route(sql,async()=>{throw new yookassa.YooKassaApiError('lost response',null,true);});
    const response=await POST(request());const body=await response.json();
    assert.equal(response.status,503);assert.equal(body.pending,true);
    const [order]=(await pg.query('SELECT * FROM orders')).rows;
    assert.equal(order.status,'pending');assert.equal(order.public_id,body.orderId);
    assert.equal((await pg.query('SELECT released_at FROM ticket_inventory_reservations')).rows[0].released_at,null);
    let activeTransactions=0,emails=0;
    const tracked=(strings,...values)=>sql(strings,...values);
    tracked.begin=async callback=>{activeTransactions++;try{return await sql.begin(callback);}finally{activeTransactions--;}};
    const payment={id:'isolated-payment',status:'succeeded',paid:true,amount:{value:'300.00',currency:'RUB'},metadata:{orderPublicId:order.public_id}};
    const {syncYooKassaPayment}=await loadTsx('../lib/server/payment-processing.ts',{
      './email-transport':await loadTsx('../lib/server/email-transport.ts'),'@/lib/server/db':{db:()=>tracked},'@/lib/server/events':{getEventServer:async()=>event},
      '@/lib/server/email':{sendTicketEmail:async(_to,input)=>{assert.equal(activeTransactions,0);assert.ok(input.deliveryKey);emails++;}},
      '@/lib/server/yookassa':{getPayment:async()=>payment,getRefund:async()=>null},'@/lib/server/security':security,
      '@/lib/server/loyalty':{updateUserLoyaltyByVisits:async()=>{}},'@/lib/server/npd':{markNpdReceiptRequired:async()=>{},markNpdAfterRefund:async()=>{}},
    });
    await syncYooKassaPayment(payment.id,'https://www.agayo.ru');
    await syncYooKassaPayment(payment.id,'https://www.agayo.ru');
    assert.equal((await pg.query('SELECT status FROM orders')).rows[0].status,'paid');
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,1);assert.equal(emails,1);
  }finally{if(flag===undefined)delete process.env.PAYMENTS_ENABLED;else process.env.PAYMENTS_ENABLED=flag;await pg.close();}
});
test('failure to store a successful provider ID does not cancel the order or release inventory',async()=>{
  const {pg,sql}=await fixture({guests:1});const flag=process.env.PAYMENTS_ENABLED;process.env.PAYMENTS_ENABLED='1';
  try {
    await pg.exec('ALTER TABLE orders ADD CONSTRAINT simulate_failed_link CHECK(yookassa_payment_id IS NULL)');
    const {POST}=await route(sql,async()=>({id:'provider-accepted',confirmation:{confirmation_url:'https://example.test/confirmation'}}));
    const response=await POST(request());assert.equal((await response.json()).pending,true);
    assert.equal((await pg.query('SELECT status FROM orders')).rows[0].status,'pending');
    assert.equal((await pg.query('SELECT released_at FROM ticket_inventory_reservations')).rows[0].released_at,null);
  }finally{if(flag===undefined)delete process.env.PAYMENTS_ENABLED;else process.env.PAYMENTS_ENABLED=flag;await pg.close();}
});

test('stale checkout cannot create an order or payment after its event is deleted or closed',async()=>{
  const {pg,sql}=await fixture({guests:0});const flag=process.env.PAYMENTS_ENABLED;process.env.PAYMENTS_ENABLED='1';
  try {
    let payments=0;
    const {POST}=await route(sql,async()=>{payments++;throw new Error('Provider must not be reached');});
    await pg.exec("UPDATE events SET sales_state='closed'");
    assert.equal((await POST(request())).status,409);
    await pg.exec('DELETE FROM events');
    assert.equal((await POST(request())).status,409);
    assert.equal(payments,0);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,0);
  }finally{if(flag===undefined)delete process.env.PAYMENTS_ENABLED;else process.env.PAYMENTS_ENABLED=flag;await pg.close();}
});
