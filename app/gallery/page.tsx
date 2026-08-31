import Link from "next/link";
import GalleryExperience from "@/components/GalleryExperience";
import SiteHeader from "@/components/SiteHeader";

export default function GalleryPage() {
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

        <GalleryExperience />

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
