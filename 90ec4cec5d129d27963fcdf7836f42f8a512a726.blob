import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from './load-ts.mjs';
import { fixture } from './database-fixture.mjs';
test('gallery returns bounded 24-photo pages, preserves every published image and excludes hidden parents',async()=>{
  const {pg,sql}=await fixture({guests:1});
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='isolated-test-fixture';
  try {
    const {getPublicPhotoPageServer}=await loadTsx('../lib/server/media.ts',{'./db':{db:()=>sql},'../photos':{galleryPhotos:[]},'../events':{events:[]}});
    await pg.exec("INSERT INTO media_photos(event_slug,url,caption,is_published,sort_order) SELECT 'test-halloween','https://images.example.test/'||n||'.jpg','Фото '||n,true,n FROM generate_series(1,53) AS n");
    const pages=await Promise.all([0,24,48].map(offset=>getPublicPhotoPageServer({offset})));
    assert.deepEqual(pages.map(page=>page.photos.length),[24,24,5]);
    assert.equal(new Set(pages.flatMap(page=>page.photos.map(photo=>photo.id))).size,53);
    assert.ok(pages.every(page=>page.total===53));
    assert.equal((await getPublicPhotoPageServer({eventSlugs:[]})).total,0);
    await pg.exec("UPDATE events SET status='draft'");
    assert.deepEqual(await getPublicPhotoPageServer(),{photos:[],total:0});
  } finally {if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;await pg.close();}
});
