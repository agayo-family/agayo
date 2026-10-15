import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTsx } from './load-ts.mjs';
import { fixture } from './database-fixture.mjs';

const photo = (id, eventSlug = 'test-halloween') => ({ id, eventSlug, eventTitle: 'Наш вечер', src: `https://gallery.public.blob.vercel-storage.com/${id}.jpg`, caption: '' });
const mediaDependencies = sql => ({ './db': { db: () => sql }, '../photos': { galleryPhotos: [] }, '../events': { events: [] } });

test('home photos stay bounded and exclude unpublished photos, hidden events and orphan albums', async () => {
  const { pg, sql } = await fixture({ guests: 1 });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'isolated-test-fixture';
  try {
    await pg.exec(`DELETE FROM media_photos;
      INSERT INTO events(slug,title,starts_at,status,sales_state,ticket_mode) VALUES('hidden-event','Hidden','2081-01-01','draft','open','zones');
      INSERT INTO media_photos(event_slug,url,is_published,sort_order)
      SELECT 'test-halloween','https://gallery.public.blob.vercel-storage.com/'||n||'.jpg',true,n FROM generate_series(1,20) AS n;
      INSERT INTO media_photos(event_slug,url,is_published,sort_order) VALUES
      ('test-halloween','https://gallery.public.blob.vercel-storage.com/hidden-photo.jpg',false,-1),
      ('hidden-event','https://gallery.public.blob.vercel-storage.com/hidden-event.jpg',true,-1),
      ('missing-event','https://gallery.public.blob.vercel-storage.com/orphan.jpg',true,-1);`);
    let queries = 0;
    const { getHomePhotosServer } = await loadTsx('../lib/server/media.ts', mediaDependencies(async (...args) => { queries++; return sql(...args); }));
    const photos = await getHomePhotosServer();
    assert.equal(queries, 1, 'the small preview does not count the full gallery');
    assert.equal(photos.length, 6);
    assert.deepEqual(photos.map(item => item.src.split('/').at(-1)), ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg']);
    assert.ok(photos.every(item => item.eventSlug === 'test-halloween'));
    await pg.exec("UPDATE events SET status='draft'");
    assert.deepEqual(await getHomePhotosServer(), []);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    await pg.close();
  }
});

test('home preview rejects image sources that would fail Next image rendering and tolerates database failure', async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'isolated-test-fixture';
  try {
    const rows = [photo('valid'), ...['not-a-url', 'http://images.unsplash.com/test.jpg', 'https://unapproved.example/photo.jpg', 'https://public.blob.vercel-storage.com.evil.example/test.jpg'].map((src, index) => ({ ...photo(String(index)), src }))]
      .map(item => ({ id: item.id, event_slug: item.eventSlug, event_title: item.eventTitle, url: item.src }));
    const { getHomePhotosServer } = await loadTsx('../lib/server/media.ts', mediaDependencies(async () => rows));
    assert.deepEqual((await getHomePhotosServer()).map(item => item.id), ['valid']);
    const unavailable = await loadTsx('../lib/server/media.ts', mediaDependencies(async () => { throw new Error('isolated unavailable database'); }));
    assert.deepEqual(await unavailable.getHomePhotosServer(), []);
  } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
});

const link = ({ children, prefetch: _prefetch, ...props }) => createElement('a', props, children);
const image = ({ fill: _fill, priority: _priority, ...props }) => createElement('img', props);
const { default: HomePhotos } = await loadTsx('../components/HomePhotos.tsx', { 'next/image': image, 'next/link': link });
const loadHome = getHomePhotos => loadTsx('../app/(landing)/page.tsx', {
  'next/image': image, 'next/link': link, '@/components/SiteHeader': () => null,
  '@/components/UpcomingAgenda': () => createElement('section', { id: 'upcoming-events' }, 'Афиша'),
  '@/components/HomePhotos': HomePhotos, '@/lib/events': { partitionEvents: () => ({ upcoming: [] }) },
  '@/lib/server/public-content': { getPublicCatalog: async () => [], getHomePhotos }, './landing.css': {},
});

test('home places accessible, lazy photo links after the agenda and keeps its empty state usable', async () => {
  const { default: Home } = await loadHome(async () => [photo('one', 'evening / 1'), { ...photo('two'), caption: 'Друзья на AGAYO' }]);
  const html = renderToStaticMarkup(await Home());
  assert.ok(html.indexOf('id="upcoming-events"') < html.indexOf('id="landing-photos-title"'));
  assert.ok(html.indexOf('landing-empty') < html.indexOf('id="landing-photos-title"'));
  assert.ok(html.indexOf('id="landing-photos-title"') < html.indexOf('landing-final'));
  assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
  assert.match(html, /sizes="\(max-width: 600px\) 45vw/);
  assert.match(html, /href="\/gallery\?event=evening%20%2F%201"/);
  assert.match(html, /alt="Друзья на AGAYO"/);
  const failed = await loadHome(async () => { throw new Error('isolated cache failure'); });
  const empty = renderToStaticMarkup(await failed.default());
  assert.match(empty, /Здесь появятся фотографии наших встреч/);
  assert.match(empty, /href="\/gallery"/);
  assert.match(empty, /УВИДИМСЯ/);
});
