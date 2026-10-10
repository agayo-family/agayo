import { unstable_cache, revalidatePath, revalidateTag } from "next/cache";
import { getPublicEventCatalogServer, getPublicEventProgramServer } from "./events";
import { getFeaturedReviewServer, getPublicPhotosServer } from "./media";

// Sessions, orders, ticket tokens and checkout availability never enter this cache.
export const getPublicCatalog = unstable_cache(getPublicEventCatalogServer,
  ["agayo-public-catalog-v1"], { tags: ["agayo-events"], revalidate: 60 });
export const getPublicPhotos = unstable_cache(getPublicPhotosServer,
  ["agayo-public-photos-v1"], { tags: ["agayo-media"], revalidate: 60 });
export const getFeaturedReview = unstable_cache(getFeaturedReviewServer,
  ["agayo-public-review-v1"], { tags: ["agayo-media"], revalidate: 60 });
export const getPublicProgram = unstable_cache(getPublicEventProgramServer,
  ["agayo-public-program-v1"], { tags: ["agayo-events"], revalidate: 60 });

export function invalidatePublicContent(kind: "events" | "media") {
  // Hide/deletion must expire immediately, rather than serving stale content.
  revalidateTag(kind === "events" ? "agayo-events" : "agayo-media", { expire: 0 });
  // Photo/review visibility also depends on the parent event's publication.
  if (kind === "events") revalidateTag("agayo-media", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/gallery");
  revalidatePath("/sitemap.xml");
}
