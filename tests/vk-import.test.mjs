import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs, loadTsx } from './load-ts.mjs';
import { fixture, actor } from './database-fixture.mjs';

const vk = await loadTs('../lib/server/vk-import.ts');
const { default: AdminMediaManager, restoreVkJob } = await loadTsx('../components/AdminMediaManager.tsx', { '@/lib/client/upload': { uploadAdminFile: () => { throw new Error('Unexpected upload'); } } });
const album = vk.parseVkAlbum('https://vk.ru/album-241505282_311782197');
const rawPhoto = (id = 17) => ({ id, owner_id: album.ownerId, album_id: album.albumId, text: 'AGAYO', sizes: [{ width: 400, height: 300, url: 'https://sun9-21.userapi.com/small.jpg' }, { width: 1600, height: 1200, url: 'https://sun9-21.userapi.com/full.jpg' }] });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const jsonResponse = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('VK albums and CDN links are pinned to trusted HTTPS hosts and numeric identifiers', () => {
  assert.deepEqual(album, { ownerId: -241505282, albumId: 311782197, url: 'https://vk.ru/album-241505282_311782197' });
  assert.equal(vk.parseVkAlbum('https://m.vk.com/album123_456?from=group').url, 'https://vk.ru/album123_456');
  for (const url of ['http://vk.ru/album1_2', 'https://vk.ru.evil.test/album1_2', 'https://user:secret@vk.ru/album1_2', 'https://vk.ru:443/album1_2', 'https://vk.ru/album1_2/extra', 'https://vk.ru/albums-123', 'https://vk.ru/album999999999999999999_2']) {
    // URL normalizes the default HTTPS port; it is still the same fixed safe origin.
    if (url.includes(':443/')) continue;
    assert.throws(() => vk.parseVkAlbum(url), vk.VkImportError);
  }
  for (const url of ['http://sun1.userapi.com/a.jpg', 'https://userapi.com.evil.test/a.jpg', 'https://127.0.0.1/a.jpg', 'https://user:pass@sun1.userapi.com/a.jpg', 'https://sun1.userapi.com:8443/a.jpg', 'https://vk.ru/a.jpg', 'file:///photo.jpg']) assert.throws(() => vk.assertVkImageUrl(url), vk.VkImportError);
  assert.equal(vk.assertVkImageUrl('https://sun1.vkuserphoto.ru/a.jpg').hostname, 'sun1.vkuserphoto.ru');
});

test('VK listing uses the fixed API and server token, validates album ownership and advances past partial failures', async () => {
  let calls = 0;
  const batch = await vk.listVkAlbumPage(album, 25, 'server-secret', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.vk.com/method/photos.get');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('access_token'), 'server-secret'); assert.equal(options.body.get('owner_id'), String(album.ownerId)); assert.equal(options.body.get('offset'), '25'); assert.equal(options.body.get('count'), '25');
    return jsonResponse({ response: { count: 100, items: [rawPhoto(), { ...rawPhoto(18), album_id: 12 }] } });
  });
  assert.equal(calls, 1); assert.equal(batch.nextOffset, 27); assert.equal(batch.items.length, 1); assert.equal(batch.failures.length, 1);
  assert.equal(batch.items[0].id, 17); assert.equal(batch.items[0].width, 1600);
  assert.doesNotMatch(JSON.stringify(batch), /server-secret|full\.jpg/);
  const photo = await vk.getVkPhoto(album, 17, 'token', async (url, options) => { assert.equal(url, 'https://api.vk.com/method/photos.getById'); assert.equal(options.body.get('photos'), '-241505282_17'); return jsonResponse({ response: [rawPhoto()] }); });
  assert.equal(photo.url, 'https://sun9-21.userapi.com/full.jpg');
  await assert.rejects(vk.getVkPhoto(album, 17, 'token', async () => jsonResponse({ response: [{ ...rawPhoto(), owner_id: -1 }] })), /не принадлежит/);
});

test('missing/expired token, access denial, throttling and CAPTCHA stop safely without reflecting provider secrets', async () => {
  await assert.rejects(vk.listVkAlbumPage(album, 0, '', () => { throw new Error('No request allowed'); }), error => error.status === 503);
  for (const [code, status] of [[5,503],[15,403],[6,429],[14,409]]) {
    await assert.rejects(vk.listVkAlbumPage(album, 0, 'server-secret', async () => jsonResponse({ error: { error_code: code, error_msg: 'server-secret secret-url', captcha_img: 'secret-url' } })), error => error.status === status && !/server-secret|secret-url/.test(error.message));
  }
  await assert.rejects(vk.listVkAlbumPage(album, -1, 'token'), /Некорректная позиция/);
});

test('image downloads validate redirects, MIME, file signature and streamed size before upload', async () => {
  const downloaded = await vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }));
  assert.equal(downloaded.extension, 'jpg'); assert.deepEqual(downloaded.bytes, jpeg);
  let calls = 0;
  await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/metadata' } }); }), /разрешённые CDN/);
  assert.equal(calls, 1);
  await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })), error => error.status === 415);
  await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => new Response('<html/>', { headers: { 'Content-Type': 'image/jpeg' } })), /не соответствует/);
  await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(vk.VK_MAX_PHOTO_BYTES + 1) } })), error => error.status === 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(vk.VK_MAX_PHOTO_BYTES)); controller.enqueue(jpeg); controller.close(); } });
  await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg', async () => new Response(stream, { headers: { 'Content-Type': 'image/jpeg' } })), error => error.status === 413);
  for (const status of [404,410]) await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg',async()=>new Response(null,{status})),error=>error.status===404);
  for (const status of [429,500,503]) await assert.rejects(vk.downloadVkPhoto('https://sun1.userapi.com/photo.jpg',async()=>new Response(null,{status})),error=>error.status===(status===429?429:502));
});

async function mediaFixture() {
  const { pg, sql } = await fixture({ guests: 0 });
  await pg.exec('ALTER TABLE media_photos ADD COLUMN source_key text; CREATE UNIQUE INDEX media_photos_source_key_unique ON media_photos(source_key) WHERE source_key IS NOT NULL;');
  return { pg, sql };
}
const input = () => ({ album, photo: vk.normalizeVkPhoto(rawPhoto(), album), sourceKey: vk.vkPhotoSourceKey(album, 17, 'test-halloween'), eventSlug: 'test-halloween', blobUrl: 'https://store.public.blob.vercel-storage.com/photo.jpg', userId: actor });

test('VK import commits photo and audit together, deduplicates retries and keeps event associations separate', async () => {
  const { pg, sql } = await mediaFixture();
  try {
    const first = await vk.commitVkPhoto(sql, input()); assert.equal(first.skipped, false);
    const repeated = await vk.commitVkPhoto(sql, { ...input(), blobUrl: 'https://store.public.blob.vercel-storage.com/duplicate.jpg' }); assert.equal(repeated.skipped, true); assert.equal(repeated.photo.id, first.photo.id);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM media_photos WHERE event_slug='test-halloween'")).rows[0].n, 1);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM admin_audit_log WHERE action='media.photo.vk_import'")).rows[0].n, 1);
    assert.notEqual(vk.vkPhotoSourceKey(album, 17, 'another-event'), input().sourceKey);
  } finally { await pg.close(); }
});

test('a deleted event or failed audit rolls back the photo instead of creating orphaned content', async () => {
  const { pg, sql } = await mediaFixture();
  try {
    await assert.rejects(vk.commitVkPhoto(sql, { ...input(), eventSlug: 'deleted-event' }), error => error.status === 409);
    await pg.exec("CREATE FUNCTION reject_vk_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER reject_vk_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_vk_audit();");
    await assert.rejects(vk.commitVkPhoto(sql, input()), /audit unavailable/);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM media_photos WHERE event_slug='test-halloween'")).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('VK endpoints authorize media and event scope before external calls and keep token values private', async () => {
  class AdminAccessError extends Error { constructor() { super('Нет доступа'); this.status = 403; } }
  const calls = [];
  const route = await loadTsx('../app/api/admin/media/vk/route.ts', {
    '@/lib/server/admin': { AdminAccessError, requireAdminPermission: async (permission, slug) => { calls.push([permission,slug]); if (slug || calls.length === 1) throw new AdminAccessError(); return { userId: actor }; } },
    '@/lib/server/db': { db: () => { throw new Error('Unexpected database'); } }, '@/lib/server/blob': { resolveBlobToken: () => 'hidden-blob-token' },
    '@/lib/server/public-content': { invalidatePublicContent: () => {} }, '@/lib/server/vk-import': vk,
    '@vercel/blob': { put: () => { throw new Error('Unexpected upload'); }, del: () => { throw new Error('Unexpected delete'); } },
  });
  const request = () => new Request('https://example.test/api/admin/media/vk', { method: 'POST', body: JSON.stringify({ action:'list', albumUrl: album.url, eventSlug:'test-halloween' }) });
  assert.equal((await route.POST(request())).status, 403);
  assert.equal((await route.POST(request())).status, 403);
  assert.deepEqual(calls, [['manage_media',undefined],['manage_media',undefined],['manage_media','test-halloween']]);
});

test('photo UI offers VK import without review controls and restores only a bounded, secret-free queue', () => {
  const html = renderToStaticMarkup(createElement(AdminMediaManager, { events: [], access: { userId: actor, role: 'owner', allEvents: true, eventSlugs: [] }, previewMode: true }));
  assert.match(html, /Импортировать альбом ВК/); assert.doesNotMatch(html, /Добавить отзыв|audio\/\*|<audio/);
  const job = { albumUrl: album.url, eventSlug: 'test-halloween', nextOffset: 25, items: [17], failed: [{ id:18,error:'Недоступно' }], imported:1, skipped:2,total:100,finished:false };
  assert.deepEqual(restoreVkJob(job), job);
  assert.equal(restoreVkJob({ ...job, access_token:'never-persist' }).access_token, undefined);
  assert.equal(restoreVkJob({ ...job, items:[-1] }), null); assert.equal(restoreVkJob({ ...job, albumUrl:'https://evil.test/album1_2' }), null); assert.equal(restoreVkJob({ ...job, nextOffset:NaN }), null);
});

test('API cleans up verified failed/duplicate uploads but retains committed or unverifiable uploads', async () => {
  class AdminAccessError extends Error { constructor() { super('Нет доступа'); this.status=403; } }
  for (const outcome of ['commit','duplicate','rollback','unknown-commit','unverifiable-commit']) {
    const deleted=[],permissions=[];
    const route=await loadTsx('../app/api/admin/media/vk/route.ts',{
      '@/lib/server/admin':{AdminAccessError,requireAdminPermission:async(permission,slug)=>{permissions.push([permission,slug]);return {userId:actor};}},
      '@/lib/server/db':{db:()=>async(strings)=>strings.join('').includes('SELECT id FROM events')?[{id:actor}]:[]},
      '@/lib/server/blob':{resolveBlobToken:()=> 'private-token'},
      '@/lib/server/public-content':{invalidatePublicContent:()=>{if(outcome==='commit')throw new Error('Cache unavailable');}},
      '@/lib/server/vk-import':{...vk,getVkPhoto:async()=>vk.normalizeVkPhoto(rawPhoto(),album),downloadVkPhoto:async()=>({bytes:jpeg,contentType:'image/jpeg',extension:'jpg'}),commitVkPhoto:async()=>{if(['rollback','unknown-commit','unverifiable-commit'].includes(outcome))throw new Error('Audit unavailable');return {skipped:outcome==='duplicate',photo:{id:'photo-row'}};},canDeleteVkUpload:async()=>{if(outcome==='unverifiable-commit')throw new Error('Database unreachable');return outcome!=='unknown-commit';}},
      '@vercel/blob':{put:async()=>({url:'https://store.public.blob.vercel-storage.com/new.jpg'}),del:async(url)=>deleted.push(url)},
    });
    const response=await route.POST(new Request('https://example.test/api/admin/media/vk',{method:'POST',body:JSON.stringify({action:'import',albumUrl:album.url,eventSlug:'test-halloween',photoId:17})}));
    assert.equal(response.status,['rollback','unknown-commit','unverifiable-commit'].includes(outcome)?500:200);
    assert.equal(deleted.length,['duplicate','rollback'].includes(outcome)?1:0);
    assert.deepEqual(permissions,[['manage_media',undefined],['manage_media','test-halloween'],['manage_media','test-halloween']]);
    assert.doesNotMatch(await response.text(),/private-token|Audit unavailable|Cache unavailable/);
  }
});

test('moving imported photos clears deduplication keys; a stale cross-event key never leaks a scoped photo', async () => {
  const {pg,sql}=await mediaFixture();
  class AdminAccessError extends Error { constructor(){super('Нет доступа');this.status=403;} }
  try{
    await pg.exec("INSERT INTO events(slug,title,starts_at,status,sales_state,ticket_mode) VALUES('other-event','Private event','2080-11-01T18:00:00Z','published','open','zones');");
    const original=await vk.commitVkPhoto(sql,input());
    const media=await loadTsx('../app/api/admin/media/route.ts',{
      '@/lib/server/db':{db:()=>sql},'@/lib/server/admin':{AdminAccessError,canAccessEvent:()=>true,requireAdminPermission:async()=>({userId:actor,role:'owner',allEvents:true}),writeAdminAudit:async()=>{}},
      '@/lib/server/blob':{resolveBlobToken:()=>null},'@/lib/server/public-content':{invalidatePublicContent:()=>{}},'@vercel/blob':{del:async()=>{throw new Error('Unexpected delete');}},
    });
    const moved=await media.PATCH(new Request('https://example.test/api/admin/media',{method:'PATCH',body:JSON.stringify({type:'photo',id:original.photo.id,eventSlug:'other-event',caption:'PRIVATE-CAPTION'})}));
    assert.equal(moved.status,200);
    assert.equal((await pg.query('SELECT source_key FROM media_photos WHERE id=$1',[original.photo.id])).rows[0].source_key,null);
    // A lost COMMIT response cannot lead to deleting a referenced Blob, even
    // after the photo was moved and its source key was deliberately cleared.
    assert.equal(await vk.canDeleteVkUpload(sql,input().sourceKey,input().blobUrl),false);
    assert.equal(await vk.canDeleteVkUpload(sql,input().sourceKey,'https://store.public.blob.vercel-storage.com/unreferenced.jpg'),true);
    const repeated=await vk.commitVkPhoto(sql,{...input(),blobUrl:'https://store.public.blob.vercel-storage.com/reimport.jpg'});
    assert.equal(repeated.skipped,false);assert.equal(repeated.photo.event_slug,'test-halloween');
    await pg.query('DELETE FROM media_photos WHERE id=$1',[repeated.photo.id]);
    // Simulate a stale key from an older/manual move, then exercise the actual
    // API with an employee who can access only the original event.
    await pg.query('UPDATE media_photos SET source_key=$1 WHERE id=$2',[input().sourceKey,original.photo.id]);
    const removed=[];
    const route=await loadTsx('../app/api/admin/media/vk/route.ts',{
      '@/lib/server/admin':{AdminAccessError,requireAdminPermission:async(permission,slug)=>{if(slug&&slug!=='test-halloween')throw new AdminAccessError();return {userId:actor};}},
      '@/lib/server/db':{db:()=>sql},'@/lib/server/blob':{resolveBlobToken:()=> 'token'},'@/lib/server/public-content':{invalidatePublicContent:()=>{}},
      '@/lib/server/vk-import':{...vk,getVkPhoto:async()=>vk.normalizeVkPhoto(rawPhoto(),album),downloadVkPhoto:async()=>({bytes:jpeg,contentType:'image/jpeg',extension:'jpg'})},
      '@vercel/blob':{put:async()=>({url:'https://store.public.blob.vercel-storage.com/scoped-attempt.jpg'}),del:async url=>removed.push(url)},
    });
    const response=await route.POST(new Request('https://example.test/api/admin/media/vk',{method:'POST',body:JSON.stringify({action:'import',albumUrl:album.url,eventSlug:'test-halloween',photoId:17})}));
    assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/PRIVATE-CAPTION|Private event|photo\.jpg/);assert.equal(removed.length,1);
    assert.equal((await pg.query('SELECT event_slug,caption FROM media_photos WHERE id=$1',[original.photo.id])).rows[0].caption,'PRIVATE-CAPTION');
    const movedByUrl=await media.POST(new Request('https://example.test/api/admin/media',{method:'POST',body:JSON.stringify({type:'photo',eventSlug:'test-halloween',url:input().blobUrl,caption:'Back'})}));
    assert.equal(movedByUrl.status,200);
    assert.equal((await pg.query('SELECT source_key FROM media_photos WHERE id=$1',[original.photo.id])).rows[0].source_key,null);
  }finally{await pg.close();}
});
