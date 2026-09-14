"use client";

import Image from "next/image";
import Link from "next/link";
import FavoriteButton from "./FavoriteButton";
import { useFavorites } from "@/lib/client/favorites";

export default function FavoritesGrid() {
  const { loaded, authenticated, photos } = useFavorites();

  if (!loaded) return <p className="inner-lead">Загружаем твои фотографии…</p>;
  if (!authenticated) return <p className="inner-lead">Войди в AGAYO ID, чтобы избранное сохранялось в аккаунте на всех устройствах.</p>;
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
