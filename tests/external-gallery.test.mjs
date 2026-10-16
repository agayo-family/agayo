import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, actor } from './database-fixture.mjs';
import { loadTs, loadTsx } from './load-ts.mjs';
import { postgresDriverSql } from './postgres-driver-sql.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const vk = await loadTs('../lib/server/vk-import.ts');
test('external album stores one reference, pages through all photos and never persists CDN URLs or files', async () => {
  const {pg}=await fixture({guests:0});
  const sql=postgresDriverSql(pg);
  const previous=process.env.DATABASE_URL, oldToken=process.env.VK_ACCESS_TOKEN;
  process.env.DATABASE_URL='fixture';process.env.VK_ACCESS_TOKEN='secret';
  const calls=[];
  try {
    await pg.exec(await readFile(new URL('../db/016_external_gallery.sql',import.meta.url),'utf8'));
    const photoCountBefore=(await pg.query('SELECT count(*)::int AS n FROM media_photos')).rows[0].n;
    const external=await loadTsx('../lib/server/external-gallery.ts',{'./db':{db:()=>sql},'./vk-import':{...vk,getVkExternalPage:async(album,offset,count,token)=>{
      assert.equal(token,'secret');calls.push([offset,count]);
      return {total:53,items:Array.from({length:Math.min(count,53-offset)},(_,i)=>({id:offset+i+1,url:`https://sun1.userapi.com/${offset+i+1}.jpg`,caption:'',width:800,height:600}))};
    }}});
    await external.saveExternalSource('test-halloween','https://vk.ru/album-241505282_311782197',actor,53);
    const local=async()=>({photos:[],total:0});
    const pages=[];for(const offset of [0,24,48])pages.push(await external.externalPhotoPage({offset},local));
    assert.deepEqual(pages.map(page=>page.photos.length),[24,24,5]);
    assert.equal(new Set(pages.flatMap(page=>page.photos.map(photo=>photo.id))).size,53);
    assert.ok(pages.every(page=>page.total===53));
    assert.ok(calls.every(([,count])=>count<=24));
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM media_photos')).rows[0].n,photoCountBefore);
    const stored=(await pg.query('SELECT * FROM event_gallery_sources')).rows;
    assert.equal(stored.length,1);assert.doesNotMatch(JSON.stringify(stored),/userapi|secret/);
    assert.equal((await pg.query("SELECT jsonb_typeof(details) AS type FROM admin_audit_log WHERE action='media.vk.connect'")).rows[0].type,'object');
    await pg.exec("ALTER TABLE events ADD deleted_at timestamptz; UPDATE events SET deleted_at=now()");
    assert.deepEqual(await external.externalPhotoPage({},local),{photos:[],total:0});
    await assert.rejects(external.saveExternalSource('test-halloween',null,actor),error=>error.status===404);
  } finally {
    if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;
    if(oldToken===undefined)delete process.env.VK_ACCESS_TOKEN;else process.env.VK_ACCESS_TOKEN=oldToken;
    await pg.close();
  }
});

test('external VK method uses bounded photos.get without downloading an image', async()=>{
  let calls=0;
  const album=vk.parseVkAlbum('https://vk.ru/album-241505282_311782197');
  const page=await vk.getVkExternalPage(album,24,24,'private',async(url,options)=>{
    calls++;assert.equal(url,'https://api.vk.com/method/photos.get');assert.equal(options.body.get('offset'),'24');assert.equal(options.body.get('count'),'24');
    return new Response(JSON.stringify({response:{count:25,items:[{id:25,owner_id:album.ownerId,album_id:album.albumId,sizes:[{width:800,height:600,url:'https://sun1.userapi.com/25.jpg'}]}]}}));
  });
  assert.equal(calls,1);assert.equal(page.items[0].url,'https://sun1.userapi.com/25.jpg');
  await assert.rejects(vk.getVkExternalPage(album,0,100,'private'),/Некорректная страница/);
});

test('the same album attached to two events keeps every photo with distinct IDs across page boundaries', async () => {
  const { pg } = await fixture({ guests: 0 });
  const sql = postgresDriverSql(pg), previous = process.env.DATABASE_URL, oldToken = process.env.VK_ACCESS_TOKEN;
  process.env.DATABASE_URL = 'fixture'; process.env.VK_ACCESS_TOKEN = 'ISOLATED';
  try {
    await pg.exec(await readFile(new URL('../db/016_external_gallery.sql', import.meta.url), 'utf8'));
    await pg.exec("INSERT INTO events(slug,title,starts_at,status,sales_state,ticket_mode) VALUES('second-event','SECOND','2081-11-01','published','closed','general-admission')");
    const external = await loadTsx('../lib/server/external-gallery.ts', { './db': { db: () => sql }, './vk-import': { ...vk, getVkExternalPage: async (_album, offset, count) => ({ total: 53, items: Array.from({ length: Math.min(count, 53-offset) }, (_, index) => ({ id: offset+index+1, url: `https://sun1.userapi.com/${offset+index+1}.jpg`, caption: '' })) }) } });
    for (const slug of ['test-halloween', 'second-event']) await external.saveExternalSource(slug, 'https://vk.ru/album-241505282_311782197', actor, 53);
    const pages = [];
    for (const offset of [0,24,48,72,96]) pages.push(await external.externalPhotoPage({ offset }, async () => ({ photos: [], total: 0 })));
    assert.deepEqual(pages.map(page => page.photos.length), [24,24,24,24,10]);
    assert.ok(pages.every(page => page.total === 106));
    const photos = pages.flatMap(page => page.photos);
    assert.equal(new Set(photos.map(photo => photo.id)).size, 106);
    assert.equal(photos.filter(photo => photo.eventSlug === 'second-event').length, 53);
    assert.equal(photos.filter(photo => photo.eventSlug === 'test-halloween').length, 53);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    if (oldToken === undefined) delete process.env.VK_ACCESS_TOKEN; else process.env.VK_ACCESS_TOKEN = oldToken;
    await pg.close();
  }
});

test('a cold public page does not call the provider for every connected album', async () => {
  const { pg } = await fixture({ guests: 0 });
  const sql = postgresDriverSql(pg), previous = process.env.DATABASE_URL, oldToken = process.env.VK_ACCESS_TOKEN;
  process.env.DATABASE_URL = 'fixture'; process.env.VK_ACCESS_TOKEN = 'ISOLATED';
  try {
    await pg.exec(await readFile(new URL('../db/016_external_gallery.sql', import.meta.url), 'utf8'));
    await pg.exec("INSERT INTO events(slug,title,starts_at,status,sales_state,ticket_mode) SELECT 'source-'||n,'Event '||n,'2081-01-01'::date+n,'published','closed','general-admission' FROM generate_series(1,100) AS n");
    await pg.exec("INSERT INTO event_gallery_sources(event_slug,provider,album_url,photo_count) SELECT slug,'vk','https://vk.ru/album-123_'||substring(slug from 8),53 FROM events WHERE slug LIKE 'source-%'");
    let calls = 0;
    const external = await loadTsx('../lib/server/external-gallery.ts', { './db': { db: () => sql }, './vk-import': { ...vk, getVkExternalPage: async (_album, offset, count) => { calls++; return { total: 53, items: Array.from({ length: count }, (_, index) => ({ id: offset+index+1, url: `https://sun1.userapi.com/${offset+index+1}.jpg`, caption: '' })) }; } } });
    const page = await external.externalPhotoPage({}, async () => ({ photos: [], total: 0 }));
    assert.equal(page.photos.length, 24); assert.equal(page.total, 5300); assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    if (oldToken === undefined) delete process.env.VK_ACCESS_TOKEN; else process.env.VK_ACCESS_TOKEN = oldToken;
    await pg.close();
  }
});

test('an album growing from 53 to 60 updates metadata and exposes the seven newly added photos', async () => {
  const { pg } = await fixture({ guests: 0 });
  const sql = postgresDriverSql(pg), previous = process.env.DATABASE_URL, oldToken = process.env.VK_ACCESS_TOKEN;
  process.env.DATABASE_URL = 'fixture'; process.env.VK_ACCESS_TOKEN = 'ISOLATED';
  try {
    await pg.exec(await readFile(new URL('../db/016_external_gallery.sql', import.meta.url), 'utf8'));
    const external = await loadTsx('../lib/server/external-gallery.ts', { './db': { db: () => sql }, './vk-import': { ...vk, getVkExternalPage: async (_album, offset, count) => ({ total: 60, items: Array.from({ length: Math.min(count, 60-offset) }, (_, index) => ({ id: offset+index+1, url: `https://sun1.userapi.com/${offset+index+1}.jpg`, caption: '' })) }) } });
    await external.saveExternalSource('test-halloween', 'https://vk.ru/album-241505282_311782197', actor, 53);
    const first = await external.externalPhotoPage({ offset: 48 }, async () => ({ photos: [], total: 0 }));
    assert.equal(first.total, 60); assert.equal(first.photos.length, 5);
    assert.equal((await pg.query('SELECT photo_count FROM event_gallery_sources')).rows[0].photo_count, 60);
    const remainder = await external.externalPhotoPage({ offset: 53 }, async () => ({ photos: [], total: 0 }));
    assert.equal(remainder.total, 60); assert.equal(remainder.photos.length, 7);
    assert.deepEqual(remainder.photos.map(photo => Number(photo.id.split(':').at(-1))), [54,55,56,57,58,59,60]);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    if (oldToken === undefined) delete process.env.VK_ACCESS_TOKEN; else process.env.VK_ACCESS_TOKEN = oldToken;
    await pg.close();
  }
});

test('provider failure is a retryable API response and initial gallery keeps local photos with a notice', async () => {
  const sensitive = new Error('ISOLATED_PROVIDER_SECRET_DO_NOT_EXPOSE');
  const api = await loadTsx('../app/api/gallery/route.ts', { '@/lib/server/public-content': { getPublicPhotoPage: async () => { throw sensitive; } } });
  const response = await api.GET(new Request('https://www.agayo.ru/api/gallery?offset=24'));
  assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /ISOLATED_PROVIDER_SECRET/);
  let props;
  const local = { photos: [{ id: 'local-photo', eventSlug: 'fixture', src: 'https://fixture.example.test/local.jpg', eventTitle: 'Fixture', caption: '' }], total: 1 };
  const { default: GalleryPage } = await loadTsx('../app/gallery/page.tsx', {
    'next/link': ({ children, href }) => createElement('a', { href }, children),
    '@/components/SiteHeader': () => null,
    '@/components/GalleryExperience': value => { props = value; return null; },
    '@/lib/server/public-content': { getPublicCatalog: async () => [], getPublicPhotoPage: async () => { throw sensitive; } },
    '@/lib/server/media': { getPublicPhotoPageServer: async () => local },
  });
  renderToStaticMarkup(await GalleryPage());
  assert.deepEqual(props.photos, local.photos); assert.equal(props.total, 1); assert.match(props.notice, /Внешний альбом временно недоступен/);
  assert.doesNotMatch(props.notice, /ISOLATED_PROVIDER_SECRET/);
});
