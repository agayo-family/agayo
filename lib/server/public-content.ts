import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { getPublicEventCatalogServer, getPublicEventProgramServer } from "./events";
import { getFeaturedReviewServer, getPublicPhotosServer, getPublicPhotoPageServer, getHomePhotosServer } from "./media";
import { getPublicAboutServer } from "./about";
import { externalPhotoPage } from './external-gallery';

// Sessions, orders, ticket tokens and checkout availability never enter this cache.
export const getPublicCatalog = unstable_cache(getPublicEventCatalogServer,
  ["agayo-public-catalog-v1"], { tags: ["agayo-events"], revalidate: 60 });
export const getPublicPhotos = unstable_cache(getPublicPhotosServer,
  ["agayo-public-photos-v1"], { tags: ["agayo-media"], revalidate: 60 });
const getLocalHomePhotos = unstable_cache(getHomePhotosServer,
  ["agayo-home-photos-v1"], { tags: ["agayo-media"], revalidate: 60 });
const getLocalPhotoPage = unstable_cache(getPublicPhotoPageServer,
  ['agayo-public-photo-page-v1'], { tags: ['agayo-media'], revalidate: 60 });
export async function getPublicPhotoPage(input: Parameters<typeof getPublicPhotoPageServer>[0] = {}) {
  return externalPhotoPage(input, getLocalPhotoPage);
}
export async function getHomePhotos() {
  const local = await getLocalHomePhotos();
  if (local.length >= 6) return local;
  try {
    const page = await getPublicPhotoPage();
    return [...local, ...page.photos.filter(photo => !local.some(item => item.id === photo.id))].slice(0, 6);
  } catch { return local; }
}
export const getFeaturedReview = unstable_cache(getFeaturedReviewServer,
  ["agayo-public-review-v1"], { tags: ["agayo-media"], revalidate: 60 });
export const getPublicProgram = unstable_cache(getPublicEventProgramServer,
  ["agayo-public-program-v1"], { tags: ["agayo-events"], revalidate: 60 });
export const getPublicAbout = unstable_cache(getPublicAboutServer,
  ["agayo-public-about-v1"], { tags: ["agayo-about"], revalidate: 60 });

export function invalidatePublicContent(kind: "events" | "media" | "about") {
  if (kind === "about") {
    revalidateTag("agayo-about", { expire: 0 });
    revalidatePath("/about");
    return;
  }
  // Hide/deletion must expire immediately, rather than serving stale content.
  revalidateTag(kind === "events" ? "agayo-events" : "agayo-media", { expire: 0 });
  // Photo/review visibility also depends on the parent event's publication.
  if (kind === "events") revalidateTag("agayo-media", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/gallery");
  revalidatePath("/sitemap.xml");
}
