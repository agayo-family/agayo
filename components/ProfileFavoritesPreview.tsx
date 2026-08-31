"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { galleryPhotos } from "@/lib/photos";

const STORAGE_KEY = "agayo:favorites";

export default function ProfileFavoritesPreview() {
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
    window.addEventListener("storage", sync);
    window.addEventListener("agayo:favorites-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("agayo:favorites-change", sync);
    };
  }, []);

  const photos = useMemo(
    () => galleryPhotos.filter((photo) => ids.includes(photo.id)).slice(0, 4),
    [ids]
  );

  if (!photos.length) {
    return (
      <div className="profile-empty profile-favorites-empty">
        <span>ПОКА ПУСТО</span>
        <p>Отмечай кадры сердцем в Галерее — они появятся здесь.</p>
        <Link href="/gallery" className="button-link">Открыть галерею <b>↗</b></Link>
      </div>
    );
  }

  return (
    <div className="profile-favorites-preview">
      {photos.map((photo) => (
        <Link href="/profile/favorites" className="profile-favorite-tile" key={photo.id}>
          <Image src={photo.src} alt={photo.eventTitle} fill sizes="(max-width: 700px) 50vw, 25vw" />
          <span>{photo.eventTitle}</span>
        </Link>
      ))}
    </div>
  );
}
