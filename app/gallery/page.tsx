import Link from "next/link";
import Image from "next/image";
import FavoriteButton from "@/components/FavoriteButton";
import SiteHeader from "@/components/SiteHeader";
import { galleryPhotos } from "@/lib/photos";

export default function GalleryPage() {
  return (
    <main className="inner-page">
      <SiteHeader />
      <div className="inner-wrap">
        <div className="section-label">02 / ГАЛЕРЕЯ</div>
        <h1 className="inner-title">ТЕ САМЫЕ<br />ВЕЧЕРА</h1>
        <p className="inner-lead">Нажми на сердце — фотография сохранится в избранное этого браузера. После подключения аккаунтов избранное переедет в базу и будет синхронизироваться между устройствами.</p>
        <div className="gallery-grid">
          {galleryPhotos.map((photo) => (
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
      </div>
    </main>
  );
}
