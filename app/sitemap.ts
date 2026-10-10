import type { MetadataRoute } from "next";
import { getPublicCatalog } from "@/lib/server/public-content";
import { siteOrigin } from "@/lib/site";

export const revalidate = 60;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const events = await getPublicCatalog();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/gallery`, changeFrequency: "weekly", priority: 0.7 },
    ...["/about", "/legal", "/legal/offer", "/legal/privacy", "/legal/user-agreement"].map((path) => ({ url: `${base}${path}`, changeFrequency: "monthly" as const, priority: 0.3 })),
    ...events.map((event) => ({ url: `${base}/events/${encodeURIComponent(event.slug)}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
