import { db } from "./db";
import { galleryPhotos, type GalleryPhoto } from "../photos";

export type PublicReview = {
  id: string;
  eventSlug: string | null;
  author: string;
  text: string;
  audioUrl?: string;
  featured: boolean;
};

export async function getPublicPhotosServer(): Promise<GalleryPhoto[]> {
  if (!process.env.DATABASE_URL) return galleryPhotos;
  try {
    const sql = db();
    const rows = await sql`
      SELECT p.id,p.event_slug,p.url,p.caption,e.title AS event_title
      FROM media_photos p
      LEFT JOIN events e ON e.slug=p.event_slug
      WHERE p.is_published=true
      ORDER BY p.event_slug,p.sort_order,p.created_at DESC
    `;
    if (!rows.length) return galleryPhotos;
    return rows.map((row:any) => ({
      id: String(row.id),
      eventSlug: String(row.event_slug),
      eventTitle: String(row.event_title || row.event_slug),
      src: String(row.url),
      caption: String(row.caption || ""),
    }));
  } catch (error) {
    console.warn("Public gallery unavailable:", error instanceof Error ? error.message : error);
    return galleryPhotos;
  }
}

export async function getFeaturedReviewServer(): Promise<PublicReview | null> {
  if (!process.env.DATABASE_URL) return { id:"fallback",eventSlug:null,author:"Алина, 16",text:"Я вообще не хотела идти. Хорошо, что друзья заставили.",featured:true };
  try {
    const sql = db();
    const rows = await sql`
      SELECT id,event_slug,author,body,audio_url,is_featured
      FROM media_reviews
      WHERE is_published=true
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
    return { id:"fallback",eventSlug:null,author:"Алина, 16",text:"Я вообще не хотела идти. Хорошо, что друзья заставили.",featured:true };
  }
}
