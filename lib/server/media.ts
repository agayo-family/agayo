import { db } from "./db";
import { galleryPhotos, type GalleryPhoto } from "../photos";
import { events } from '../events';

export type PublicReview = {
  id: string;
  eventSlug: string | null;
  author: string;
  text: string;
  audioUrl?: string;
  featured: boolean;
};

export type PhotoPageInput = { offset?: number; sort?: 'newest' | 'oldest'; eventSlugs?: string[] };
export async function getPublicPhotoPageServer(input: PhotoPageInput = {}): Promise<{ photos: GalleryPhoto[]; total: number }> {
  const offset = Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0)));
  const slugs = Array.isArray(input.eventSlugs) ? input.eventSlugs.slice(0, 100) : null;
  const oldest = input.sort === 'oldest';
  if (!process.env.DATABASE_URL) {
    const dates = new Map(events.map(event => [event.slug, Date.parse(event.startsAt)]));
    const photos = galleryPhotos.filter(photo => !slugs || slugs.includes(photo.eventSlug)).sort((a, b) => ((dates.get(a.eventSlug) || 0) - (dates.get(b.eventSlug) || 0)) * (oldest ? 1 : -1));
    return { photos: photos.slice(offset, offset + 24), total: photos.length };
  }
  try {
    const sql = db();
    const [rows, counts] = await Promise.all([sql`
      SELECT p.id,p.event_slug,p.url,p.caption,e.title AS event_title
      FROM media_photos p
      LEFT JOIN events e ON e.slug=p.event_slug
      WHERE p.is_published=true AND e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL
        AND (${slugs === null} OR p.event_slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(slugs || [])}::text::jsonb)))
      ORDER BY CASE WHEN ${oldest} THEN e.starts_at END ASC,CASE WHEN ${!oldest} THEN e.starts_at END DESC,p.sort_order,p.created_at DESC,p.id
      LIMIT 24 OFFSET ${offset}
    `, sql`SELECT count(*)::int AS total FROM media_photos p JOIN events e ON e.slug=p.event_slug
      WHERE p.is_published=true AND e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL
      AND (${slugs === null} OR p.event_slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(slugs || [])}::text::jsonb)))`]);
    return { total: Number(counts[0]?.total || 0), photos: rows.map((row:any) => ({
      id: String(row.id),
      eventSlug: String(row.event_slug),
      eventTitle: String(row.event_title || row.event_slug),
      src: String(row.url),
      caption: String(row.caption || ""),
    })) };
  } catch (error) {
    console.warn("Public gallery unavailable:", error instanceof Error ? error.message : error);
    return { photos: [], total: 0 };
  }
}

export async function getPublicPhotosServer(): Promise<GalleryPhoto[]> {
  return (await getPublicPhotoPageServer()).photos;
}

const HOME_PHOTO_LIMIT = 6;

function isHomePhotoSource(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && !url.username && !url.password && (
      url.hostname === "images.unsplash.com" || url.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch { return false; }
}

// The home preview needs a few photos, not a full gallery page and count query.
export async function getHomePhotosServer(): Promise<GalleryPhoto[]> {
  if (!process.env.DATABASE_URL) {
    const published = new Map(events.filter(event => event.status === "published").map(event => [event.slug, Date.parse(event.startsAt)]));
    return galleryPhotos.filter(photo => published.has(photo.eventSlug) && isHomePhotoSource(photo.src))
      .sort((a, b) => (published.get(b.eventSlug) || 0) - (published.get(a.eventSlug) || 0))
      .slice(0, HOME_PHOTO_LIMIT);
  }
  try {
    const rows = await db()`
      SELECT p.id,p.event_slug,p.url,p.caption,e.title AS event_title
      FROM media_photos p JOIN events e ON e.slug=p.event_slug
      WHERE p.is_published=true AND e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL
      ORDER BY e.starts_at DESC,p.is_featured DESC,p.sort_order,p.created_at DESC,p.id
      LIMIT ${HOME_PHOTO_LIMIT}
    `;
    return rows.map((row: any) => ({
      id: String(row.id), eventSlug: String(row.event_slug), eventTitle: String(row.event_title),
      src: String(row.url), caption: String(row.caption || ""),
    })).filter(photo => isHomePhotoSource(photo.src));
  } catch (error) {
    console.warn("Home photos unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getFeaturedReviewServer(): Promise<PublicReview | null> {
  if (!process.env.DATABASE_URL) return { id:"fallback",eventSlug:null,author:"Алина, 16",text:"Я вообще не хотела идти. Хорошо, что друзья заставили.",featured:true };
  try {
    const sql = db();
    const rows = await sql`
      SELECT id,event_slug,author,body,audio_url,is_featured
      FROM media_reviews
      WHERE is_published=true AND (event_slug IS NULL OR EXISTS (SELECT 1 FROM events e WHERE e.slug=media_reviews.event_slug AND e.status='published' AND (to_jsonb(e)->>'deleted_at') IS NULL))
      ORDER BY is_featured DESC,sort_order,created_at DESC
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      id:String(rows[0].id), eventSlug:rows[0].event_slug ? String(rows[0].event_slug) : null,
      author:String(rows[0].author), text:String(rows[0].body || ""),
      audioUrl:rows[0].audio_url ? String(rows[0].audio_url) : undefined, featured:Boolean(rows[0].is_featured),
    };
  } catch (error) {
    console.warn("Public review unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}
