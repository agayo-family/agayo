// Isolated PostgreSQL/WASM model. No external database, emails or payments.
import { PGlite } from '@electric-sql/pglite';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const pg = new PGlite();
try {
  const directory = new URL('../db/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await pg.exec((await readFile(new URL(file,directory),'utf8')).replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g,''));
  }
  await pg.exec(`
    TRUNCATE media_photos,media_reviews CASCADE;
    INSERT INTO users(email,display_name,loyalty_level) SELECT 'model-'||n||'@example.test','Гость модели '||n,'GOLD' FROM generate_series(1,500) n;
    INSERT INTO events(slug,title,starts_at,status,sales_state,description,hero_image,poster_image)
      SELECT 'model-event-'||n,'МЕРОПРИЯТИЕ '||n,'2080-01-01'::timestamptz+n*interval '1 day','published','open',repeat(md5(n::text),40),'/model-poster.jpg','/model-poster.jpg' FROM generate_series(1,50) n;
    INSERT INTO event_ticket_categories(event_id,category_key,name,price,inventory) SELECT id,'standard','STANDARD',300,500 FROM events;
    INSERT INTO media_photos(event_slug,url,caption,is_published,sort_order)
      SELECT e.slug,'https://model.public.blob.vercel-storage.com/media/photo/'||e.slug||'/'||md5(e.slug||n)||'-photograph.webp','Момент AGAYO '||n||' '||md5(e.slug||n),true,n FROM events e CROSS JOIN generate_series(1,150) n;
    INSERT INTO orders(public_id,user_id,event_slug,email,owner_name,status,subtotal,total,paid_at,legal_accepted_at,privacy_accepted_at,legal_version,event_rules_snapshot)
      SELECT 'MODEL-'||u.id||'-'||e.slug,u.id,e.slug,u.email,u.display_name,'paid',300,300,now(),now(),now(),'MODEL',repeat(md5(e.slug),20) FROM users u CROSS JOIN events e;
    INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) SELECT id,'standard','STANDARD',300,1 FROM orders;
    INSERT INTO tickets(public_id,qr_token,order_id,user_id,event_slug,owner_name,category_id,category_name,status)
      SELECT 'MODEL-TICKET-'||id,md5(id::text)||md5(public_id),id,user_id,event_slug,owner_name,'standard','STANDARD','valid' FROM orders;
    INSERT INTO ticket_deliveries(ticket_id,channel,destination,status,attempts,sent_at) SELECT t.id,'email',u.email,'sent',1,now() FROM tickets t JOIN users u ON u.id=t.user_id;
    INSERT INTO sessions(user_id,token_hash,expires_at) SELECT id,md5(id::text),now()+interval '30 days' FROM users;
    INSERT INTO login_codes(channel,destination,code_hash,expires_at,consumed_at) SELECT 'email',u.email,md5(u.id::text||n),now(),now() FROM users u CROSS JOIN generate_series(1,10) n;
    ANALYZE;
  `);
  const tables=(await pg.query("SELECT relname AS table_name,pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(relid) DESC")).rows.map(row=>({...row,bytes:Number(row.bytes)}));
  const counts=(await pg.query('SELECT (SELECT count(*)::int FROM users) accounts,(SELECT count(*)::int FROM events) events,(SELECT count(*)::int FROM media_photos) photos,(SELECT count(*)::int FROM tickets) tickets,(SELECT count(*)::int FROM orders) orders')).rows[0];
  const result={environment:'isolated PostgreSQL through PGlite, actual repository migrations, not production usage',assumptions:'500 accounts × 50 events × one purchased ticket = 25000 orders/tickets; 7500 photo URLs, images stored separately; 500 sessions and 5000 login-code records',counts,tables,totalRelationBytes:tables.reduce((sum,row)=>sum+row.bytes,0),photoFileScenariosMB:[0.5,1,2,4].map(averageMB=>({averageMB,files:7500,totalGB:averageMB*7500/1000}))};
  await writeFile(process.argv[2]||'/tmp/agayo-storage-model.json',JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({counts,totalRelationBytes:result.totalRelationBytes,photoFileScenariosMB:result.photoFileScenariosMB})+'\n');
}finally{await pg.close();}
