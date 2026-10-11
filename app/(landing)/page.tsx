import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import VoiceReview from "@/components/VoiceReview";
import UpcomingAgenda from "@/components/UpcomingAgenda";
import { partitionEvents } from "@/lib/events";
import { getFeaturedReview, getPublicCatalog, getPublicPhotos } from "@/lib/server/public-content";
import "./landing.css";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const upcoming = partitionEvents(await getPublicCatalog()).upcoming[0];
  const title = "AGAYO — создавай воспоминания";
  const description = "Вечеринки, концерты и клабшоу AGAYO в Йошкар-Оле. Афиша ближайших встреч, билеты и фотографии. Мы — свои.";
  return {
    title: { absolute: title }, description, alternates: { canonical: "/" },
    openGraph: {
      type: "website", locale: "ru_RU", siteName: "AGAYO", url: "/", title, description,
      images: [{ url: upcoming?.posterImage ?? upcoming?.heroImage ?? "/events/vernite-lampovost-poster.jpg" }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Home() {
  const [events, mediaPhotos, featuredReview] = await Promise.all([
    getPublicCatalog(), getPublicPhotos(), getFeaturedReview(),
  ]);
  const { upcoming, archive } = partitionEvents(events);
  const cover = mediaPhotos[0]?.src ?? archive[0]?.heroImage ?? upcoming[0]?.heroImage ?? "/events/vernite-lampovost-poster.jpg";
  const memories = mediaPhotos.slice(0, 3);
  const agendaHref = upcoming.length ? "#upcoming-events" : "/events";

  return (
    <main id="main-content" className="home-page event-landing">
      <SiteHeader overlay />
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span className="landing-live-dot" aria-hidden="true" />AGAYO FAMILY / МЫ — СВОИ</div>
          <h1 id="landing-title">ПРОЖИВИ<br />ЭТОТ ВЕЧЕР.</h1>
          <p className="landing-hero-meta">Музыка. Люди. Воспоминания.<br />Твоя следующая история — на AGAYO.</p>
          <div className="landing-actions">
            <Link className="button-link button-link-accent" href={agendaHref}>Афиша и билеты <span aria-hidden="true">↗</span></Link>
            <Link className="landing-secondary-link" href={memories.length ? "#memories" : "/gallery"}>Как это было <span aria-hidden="true">↓</span></Link>
          </div>
        </div>
        <div className="landing-poster landing-atmosphere">
          <Image src={cover} alt={mediaPhotos[0]?.caption ?? "Атмосфера вечеров AGAYO"} fill priority sizes="(max-width: 600px) 100vw, (max-width: 900px) 68vw, 43vw" className="landing-poster-image" />
          <div className="landing-poster-caption"><span>AGAYO FAMILY</span><span>СОЗДАВАЙ ВОСПОМИНАНИЯ</span></div>
        </div>
        <div className="landing-hero-foot"><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span><Link href={agendaHref} aria-label="Перейти к афише">↓</Link><span>ЙОШКАР-ОЛА</span></div>
      </section>

      <UpcomingAgenda events={upcoming} />
      {!upcoming.length && <section className="landing-empty section-pad"><div className="section-label">01 / АФИША</div><h2>НОВЫЙ ВЕЧЕР<br />ВПЕРЕДИ.</h2><p>Готовим следующую встречу. Анонс и билеты появятся здесь.</p><Link className="text-link" href="/events">Наши события <span aria-hidden="true">↗</span></Link></section>}

      {memories.length > 0 && <section id="memories" className="landing-memories section-pad" aria-labelledby="landing-memories-title">
        <div className="section-label">02 / AGAYO В КАДРЕ</div>
        <div className="landing-section-heading"><h2 id="landing-memories-title">ЛИЦА.<br />МОМЕНТЫ. МЫ.</h2><Link className="text-link" href="/gallery">Вся галерея <span aria-hidden="true">↗</span></Link></div>
        <div className="landing-photo-grid">{memories.map((photo) => <Link key={photo.id} className="landing-photo" href={`/gallery?event=${encodeURIComponent(photo.eventSlug)}`} aria-label={`Фотографии события ${photo.eventTitle}`}><div><Image src={photo.src} alt={photo.caption ?? `Вечер ${photo.eventTitle}`} fill sizes="(max-width: 600px) 92vw, (max-width: 900px) 45vw, 29vw" /></div><span>{photo.eventTitle}<b aria-hidden="true">↗</b></span></Link>)}</div>
      </section>}

      {featuredReview && <section className="voices section-pad"><div className="section-label">03 / ГОЛОСА ПОСЛЕ ВЕЧЕРА</div><VoiceReview audioSrc={featuredReview.audioUrl} text={featuredReview.text} author={featuredReview.author} /></section>}
      <section className="landing-team section-pad"><span className="section-label">AGAYO / МЫ — СВОИ</span><h2>МЫ ДЕЛАЕМ<br />ВЕЧЕРА СВОИМИ.</h2><Link className="text-link" href="/about">Познакомиться с командой <span aria-hidden="true">↗</span></Link></section>
      <section className="landing-final section-pad"><div className="section-label">ДО ВСТРЕЧИ</div><h2>УВИДИМСЯ<br />НА AGAYO.</h2><p>Выбери вечер. Дальше встретимся вживую.</p><Link className="button-link button-link-accent" href={agendaHref}>Выбрать событие <span aria-hidden="true">↗</span></Link></section>
      <footer className="footer"><div><div className="footer-brand">AGAYO<span className="brand-dot">.</span></div><p>Проживи так, чтобы вспомнить.</p><p>ИП Ергин Сергей Валентинович · ИНН 121524098311</p></div><div className="footer-links"><Link href="/events">Мероприятия</Link><Link href="/gallery">Галерея</Link><Link href="/about">О нас</Link><Link href="/profile" prefetch={false}>Профиль</Link><Link href="/legal">Правовая информация</Link></div><div className="footer-bottom"><span>Мы — свои</span><span>© AGAYO 2023–{new Date().getFullYear()}</span></div></footer>
    </main>
  );
}
