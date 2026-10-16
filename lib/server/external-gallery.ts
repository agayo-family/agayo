import { db } from './db';
import { getVkExternalPage, parseVkAlbum, VkImportError } from './vk-import';
import type { GalleryPhoto } from '../photos';
import type { PhotoPageInput } from './media';

// Bounded, short-lived process memory only. No Blob, photo rows or persistent URL cache.
const pages = new Map<string, { expires: number; value: ReturnType<typeof getVkExternalPage> }>();
export function clearExternalGalleryCache() { pages.clear(); }
function vkPage(albumUrl: string, offset: number, count: number) {
  const token = process.env.VK_ACCESS_TOKEN?.trim() || '';
  if (!token) throw new VkImportError('Галерея ВК ещё не подключена', 503);
  const key = `${albumUrl}:${offset}:${count}`;
  const cached = pages.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pages.size >= 256) pages.delete(pages.keys().next().value!);
  const value = getVkExternalPage(parseVkAlbum(albumUrl), offset, count, token);
  pages.set(key, { expires: Date.now() + 60000, value });
  void value.catch(() => { if (pages.get(key)?.value === value) pages.delete(key); });
  return value;
}

export async function listExternalSources() {
  const sql = db();
  const [ready] = await sql`SELECT to_regclass('public.event_gallery_sources') AS name`;
  if (!ready?.name) return [];
  return sql`SELECT s.event_slug,s.album_url,s.photo_count,e.title,e.starts_at FROM event_gallery_sources s
    JOIN events e ON e.slug=s.event_slug WHERE e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL ORDER BY e.starts_at DESC,e.slug`;
}

export async function saveExternalSource(eventSlug: string, albumUrl: string | null, actorId: string, photoCount = 0) {
  const sql = db();
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(714206016)`;
    const [event] = await tx`SELECT id FROM events e WHERE slug=${eventSlug} AND (to_jsonb(e)->>'deleted_at') IS NULL FOR UPDATE`;
    if (!event) throw new VkImportError('Мероприятие не найдено', 404);
    const [ready] = await tx`SELECT to_regclass('public.event_gallery_sources') AS name`;
    if (!ready?.name) await tx`CREATE TABLE IF NOT EXISTS event_gallery_sources (
      event_slug text PRIMARY KEY REFERENCES events(slug),provider text NOT NULL CHECK(provider='vk'),album_url text NOT NULL,photo_count integer NOT NULL DEFAULT 0 CHECK(photo_count>=0),
      updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now())`;
    if (albumUrl) await tx`INSERT INTO event_gallery_sources(event_slug,provider,album_url,photo_count,updated_by) VALUES(${eventSlug},'vk',${albumUrl},${photoCount},${actorId})
      ON CONFLICT(event_slug) DO UPDATE SET album_url=EXCLUDED.album_url,photo_count=EXCLUDED.photo_count,updated_by=EXCLUDED.updated_by,updated_at=now()`;
    else await tx`DELETE FROM event_gallery_sources WHERE event_slug=${eventSlug}`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorId},${albumUrl ? 'media.vk.connect' : 'media.vk.disconnect'},'event',${eventSlug},${JSON.stringify({ provider: 'vk', albumUrl })}::text::jsonb)`;
  });
}

type LocalPage = (input?: PhotoPageInput) => Promise<{ photos: GalleryPhoto[]; total: number }>;
export async function externalPhotoPage(input: PhotoPageInput, localPage: LocalPage) {
  if (!process.env.DATABASE_URL) return localPage(input);
  const sources = (await listExternalSources()).filter(row => !input.eventSlugs || input.eventSlugs.includes(String(row.event_slug)));
  if (!sources.length) return localPage(input);
  const sql = db();
  const localCounts = await sql`SELECT e.slug,e.title,e.starts_at,count(p.id)::int AS total FROM events e
    LEFT JOIN media_photos p ON p.event_slug=e.slug AND p.is_published=true
    WHERE e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL
    AND (${!input.eventSlugs} OR e.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(input.eventSlugs || [])}::text::jsonb)))
    GROUP BY e.slug,e.title,e.starts_at`;
  const streams: Array<{ slug: string; title: string; starts: number; total: number; album?: string }> = localCounts
    .filter(row => Number(row.total) > 0).map(row => ({ slug: String(row.slug), title: String(row.title), starts: new Date(row.starts_at).getTime(), total: Number(row.total) }));
  // Album counts are metadata refreshed by admin connect. A public page must
  // never fan out to every album merely to count its photos.
  for (const source of sources) {
    streams.push({ slug: String(source.event_slug), title: String(source.title), starts: new Date(source.starts_at).getTime(), total: Number(source.photo_count), album: String(source.album_url) });
  }
  streams.sort((a, b) => (a.starts - b.starts) * (input.sort === 'oldest' ? 1 : -1) || a.slug.localeCompare(b.slug) || Number(Boolean(a.album)) - Number(Boolean(b.album)));
  let skip = Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0)));
  const photos: GalleryPhoto[] = [];
  for (const stream of streams) {
    if (skip >= stream.total) { skip -= stream.total; continue; }
    const count = Math.min(24 - photos.length, stream.total - skip);
    if (stream.album) {
      const page = await vkPage(stream.album, skip, count);
      if(page.total!==stream.total) {
        // Album-level count is permitted metadata. Updating it prevents the next
        // offset from stopping at an obsolete count after VK adds/removes photos.
        await sql`UPDATE event_gallery_sources SET photo_count=${page.total}
          WHERE event_slug=${stream.slug} AND album_url=${stream.album} AND photo_count<>${page.total}`;
      }
      stream.total=page.total;
      const album = parseVkAlbum(stream.album);
      photos.push(...page.items.map(item => ({ id: `vk:${stream.slug}:${album.ownerId}:${album.albumId}:${item.id}`, eventSlug: stream.slug, eventTitle: stream.title, src: item.url, caption: item.caption })));
    } else {
      const page = await localPage({ ...input, eventSlugs: [stream.slug], offset: skip });
      photos.push(...page.photos.slice(0, count));
    }
    skip = 0;
    if (photos.length === 24) break;
  }
  return { photos, total: streams.reduce((sum, stream) => sum + stream.total, 0) };
}
