import Image from "next/image";
import Link from "next/link";
import type { GalleryPhoto } from "@/lib/photos";

export default function HomePhotos({ photos }: { photos: GalleryPhoto[] }) {
  return (
    <section className="landing-photos section-pad" aria-labelledby="landing-photos-title">
      <div className="section-label">03 / ФОТОГРАФИИ</div>
      <div className="landing-section-heading">
        <h2 id="landing-photos-title">ТАК ЭТО<br />БЫЛО.</h2>
        <div className="landing-photos-heading-note">
          <p>Люди, музыка и вечера, которые хочется сохранить.</p>
          <Link className="text-link" href="/gallery">Все фотографии <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      {photos.length ? <div className="landing-photo-grid">
        {photos.map(photo => (
          <Link className="landing-photo" href={`/gallery?event=${encodeURIComponent(photo.eventSlug)}`} key={photo.id}>
            <div><Image src={photo.src} unoptimized={photo.id.startsWith('vk:')} alt={photo.caption || `Фотография с мероприятия «${photo.eventTitle}»`} fill loading="lazy" sizes="(max-width: 600px) 45vw, (max-width: 900px) 46vw, 29vw" /></div>
            <span><span>{photo.eventTitle}</span><b aria-hidden="true">↗</b></span>
          </Link>
        ))}
      </div> : <p className="landing-photos-empty">Здесь появятся фотографии наших встреч. Увидимся в кадре.</p>}
    </section>
  );
}
