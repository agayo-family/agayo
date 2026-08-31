"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { galleryPhotos } from "@/lib/photos";
import FavoriteButton from "./FavoriteButton";

const STORAGE_KEY = "agayo:favorites";

export default function FavoritesGrid() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => {
      try {
        const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        setIds(Array.isArray(value) ? value : []);
      } catch {
        setIds([]);
      }
    };
    sync();
    window.addEventListener("agayo:favorites-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("agayo:favorites-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const photos = useMemo(() => galleryPhotos.filter((photo) => ids.includes(photo.id)), [ids]);

  if (!photos.length) return <p className="inner-lead">Здесь появятся фотографии, которые ты отметишь сердцем в галерее.</p>;

  return (
    <div className="gallery-grid">
      {photos.map((photo) => (
        <article className="gallery-card" key={photo.id}>
          <div className="gallery-image-wrap">
            <Link href={`/events/${photo.eventSlug}`} className="card-image-link" aria-label={`Открыть ${photo.eventTitle}`}>
              <Image src={photo.src} alt={photo.eventTitle} fill sizes="(max-width: 700px) 100vw, 50vw" className="gallery-image" />
            </Link>
            <FavoriteButton photoId={photo.id} />
          </div>
          <Link href={`/events/${photo.eventSlug}`} className="gallery-caption"><span>{photo.eventTitle}</span><span>↗</span></Link>
        </article>
      ))}
    </div>
  );
}
