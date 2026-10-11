import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs,loadTsx} from './load-ts.mjs';
import {fixture,actor} from './database-fixture.mjs';
const {adminTicketView}=await loadTs('../lib/admin-ticket-view.ts');
const personal=await loadTs('../lib/server/personal-ticket-store.ts');
test('controller ticket view retains necessary identification but never serializes financial amounts, receipt links or future SQL fields',()=>{
  const row={id:'ticket',owner_name:'Guest',email:'guest@example.test',phone:'+79990000000',subtotal:550,total:450,unit_price:550,refunded_amount:100,npd_receipt_url:'https://example.test/private-receipt',yookassa_payment_id:'private-payment',ticket_refund_yookassa_id:'private-refund',paid_share:450,internal_new_field:'must-not-leak'};
  const controller=adminTicketView(row,false);
  assert.equal(controller.owner_name,'Guest');assert.equal(controller.email,row.email);assert.equal(controller.phone,row.phone);
  for(const field of ['subtotal','unit_price','total','refunded_amount','paid_share'])assert.equal(controller[field],0);
  for(const field of ['npd_receipt_url','yookassa_payment_id','ticket_refund_yookassa_id'])assert.equal(controller[field],null);
  assert.equal(Object.hasOwn(controller,'internal_new_field'),false);
  assert.equal(adminTicketView(row,true).subtotal,550);
});
test('draft event photos disappear from favorites and cannot be added by their known ID',async()=>{
  const {pg,sql}=await fixture({guests:1});
  try {
    await pg.exec('CREATE TABLE photo_favorites(user_id uuid,photo_id uuid,created_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,photo_id))');
    const [photo]=(await pg.query("INSERT INTO media_photos(event_slug,url,is_published) VALUES('test-halloween','https://example.test/favorite.jpg',true) RETURNING id")).rows;
    await pg.query('INSERT INTO photo_favorites(user_id,photo_id) VALUES($1,$2)',[actor,photo.id]);
    const {GET,POST}=await loadTsx('../app/api/favorites/route.ts',{'@/lib/server/auth':{getCurrentUser:async()=>({id:actor})},'@/lib/server/db':{db:()=>sql}});
    assert.equal((await (await GET()).json()).photos.length,1);
    await pg.exec("UPDATE events SET status='draft'");
    assert.equal((await (await GET()).json()).photos.length,0);
    const response=await POST(new Request('https://www.agayo.ru/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoId:photo.id,active:true})}));
    assert.equal(response.status,404);
  }finally{await pg.close();}
});
test('generic order retry never sends a second unpersonalized email for a gift campaign',async()=>{
  const {pg,sql}=await fixture({guests:1});
  try {
    const campaign=await personal.savePersonalCampaign(sql,{actorId:actor,eventSlug:'test-halloween',categoryId:'standard',title:'Твой GOLD',description:'Личное описание',levels:['GOLD']});
    await personal.issuePersonalBatch(sql,campaign.id,actor);
    const [order]=(await pg.query('SELECT * FROM orders')).rows;
    let calls=0;
    const {retryOrderTicketDelivery,deliverOrderTickets}=await loadTsx('../lib/server/payment-processing.ts',{
      '@/lib/server/db':{db:()=>sql},'@/lib/server/events':{getEventServer:async()=>({slug:'test-halloween'})},
      '@/lib/server/email':{sendTicketEmail:async()=>{calls++;}},'@/lib/server/yookassa':{},
      '@/lib/server/security':{},'@/lib/server/loyalty':{},'@/lib/server/npd':{},
    });
    assert.equal(await retryOrderTicketDelivery(order.public_id,'https://www.agayo.ru'),false);
    await deliverOrderTickets(order,{slug:'test-halloween'},'https://www.agayo.ru');
    assert.equal(calls,0);
    assert.equal((await pg.query('SELECT status FROM ticket_deliveries')).rows[0].status,'pending');
  }finally{await pg.close();}
});
