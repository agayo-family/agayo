"use client";

import Image from "next/image";
import Link from "next/link";
import { useFavorites } from "@/lib/client/favorites";

export default function ProfileFavoritesPreview() {
  const { loaded, authenticated, photos } = useFavorites();
  const preview = photos.slice(0, 4);

  if (!loaded) return <div className="profile-memory-empty"><p>Загружаем избранное…</p></div>;
  if (!authenticated || !preview.length) {
    return (
      <div className="profile-empty profile-favorites-empty">
        <span>ПОКА ПУСТО</span>
        <p>{authenticated ? "Отмечай кадры сердцем в Галерее — они появятся здесь." : "Войди в AGAYO ID и отмечай кадры сердцем — они будут храниться в аккаунте."}</p>
        <Link href={authenticated ? "/gallery" : "/auth?next=%2Fgallery"} className="button-link">{authenticated ? "Открыть галерею" : "Войти"} <b>↗</b></Link>
      </div>
    );
  }

  return (
    <div className="profile-favorites-preview">
      {preview.map((photo) => (
        <Link href="/profile/favorites" className="profile-favorite-tile" key={photo.id}>
          <Image src={photo.src} alt={photo.eventTitle} fill sizes="(max-width: 700px) 50vw, 25vw" />
          <span>{photo.eventTitle}</span>
        </Link>
      ))}
    </div>
  );
}
