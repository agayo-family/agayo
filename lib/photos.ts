export type GalleryPhoto = {
  id: string;
  eventSlug: string;
  eventTitle: string;
  src: string;
};

export const galleryPhotos: GalleryPhoto[] = [
  { id: "night-01", eventSlug: "agayo-night", eventTitle: "AGAYO NIGHT", src: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=85" },
  { id: "summer-01", eventSlug: "summer-01", eventTitle: "SUMMER / 01", src: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85" },
  { id: "club-01", eventSlug: "clubshow", eventTitle: "CLUBSHOW", src: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85" },
  { id: "night-02", eventSlug: "agayo-night", eventTitle: "AGAYO NIGHT", src: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=85" },
  { id: "summer-02", eventSlug: "summer-01", eventTitle: "SUMMER / 01", src: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=85" },
  { id: "club-02", eventSlug: "clubshow", eventTitle: "CLUBSHOW", src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=85" },
];
