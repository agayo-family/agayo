import Link from "next/link";
import GalleryExperience from "@/components/GalleryExperience";
import SiteHeader from "@/components/SiteHeader";
import { getPublishedEventsServer } from "@/lib/server/events";
import { getPublicPhotosServer } from "@/lib/server/media";

export const dynamic = "force-dynamic";
export default async function GalleryPage() {
  const [events, photos] = await Promise.all([getPublishedEventsServer(), getPublicPhotosServer()]);
  const publishedEvents = events.map((event) => ({ slug:event.slug,title:event.title,dateLabel:event.dateLabel,startsAt:event.startsAt,city:event.city }));
  return (
    <main className="inner-page gallery-page-v2">
      <SiteHeader />
      <div className="inner-wrap gallery-wrap-v2">
        <section className="gallery-hero-v2">
          <div className="section-label">02 / ГАЛЕРЕЯ</div>
          <h1 className="inner-title">МЫ ЭТО<br />ПОМНИМ</h1>
          <div className="gallery-hero-copy">
            <p>Не просто фотографии. Архив вечеров, людей и моментов, которые остались с нами.</p>
            <span>НАЙДИ СВОЙ ВЕЧЕР ↓</span>
          </div>
        </section>

        <GalleryExperience photos={photos} publishedEvents={publishedEvents} />

        <section className="gallery-memory-cta">
          <div className="section-label">ТВОЙ АРХИВ</div>
          <h2>ТЫ БЫЛ<br />ЗДЕСЬ?</h2>
          <div>
            <p>Сохраняй любимые кадры. Они собираются в твоём профиле и останутся частью твоей истории AGAYO.</p>
            <Link className="button-link" href="/profile/favorites">МОИ ИЗБРАННЫЕ <span>↗</span></Link>
          </div>
        </section>
      </div>
    </main>
  );
}
