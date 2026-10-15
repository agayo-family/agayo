import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import UpcomingAgenda from "@/components/UpcomingAgenda";
import HomePhotos from "@/components/HomePhotos";
import { partitionEvents } from "@/lib/events";
import { getPublicCatalog, getHomePhotos } from "@/lib/server/public-content";
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
  const [catalog, photos] = await Promise.all([getPublicCatalog(), getHomePhotos().catch(() => [])]);
  const { upcoming } = partitionEvents(catalog);
  const nearest = upcoming[0];
  const cover = nearest?.posterImage || nearest?.heroImage;
  const agendaHref = upcoming.length ? "#upcoming-events" : "/events";

  return (
    <main id="main-content" className="home-page event-landing">
      <SiteHeader overlay />
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span className="landing-live-dot" aria-hidden="true" />AGAYO FAMILY / МЫ — СВОИ</div>
          <h1 id="landing-title">СОЗДАВАЙ<br />ВОСПОМИНАНИЯ,<br /><span>А НЕ ПРОВАЛЫ<br />В ПАМЯТИ.</span></h1>
          <p className="landing-hero-meta">Музыка. Люди. Твой вечер.<br />AGAYO — мы свои.</p>
          <div className="landing-actions">
            <Link className="button-link button-link-accent" href={agendaHref}>Афиша и билеты <span aria-hidden="true">↗</span></Link>
            <Link className="landing-secondary-link" href="/gallery">Как это было <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        {cover && <div className="landing-hero-backdrop"><Image src={cover} alt={`Афиша ближайшего мероприятия: ${nearest.title}`} fill priority sizes="100vw" className="landing-poster-image" /></div>}
        <div className="landing-hero-foot"><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span><Link href={agendaHref} aria-label="Перейти к афише">↓</Link><span>ЙОШКАР-ОЛА</span></div>
      </section>

      <section className="landing-team section-pad" aria-labelledby="landing-team-title"><span className="section-label">01 / МЫ — СВОИ</span><div><h2 id="landing-team-title">МЫ — СВОИ.</h2><p>Создаём вечера, которые сами хотели бы прожить. Познакомься с людьми, которые стоят за AGAYO.</p><Link className="text-link" href="/about">Познакомиться с командой <span aria-hidden="true">↗</span></Link></div></section>
      <UpcomingAgenda events={upcoming.map(({ slug, title, startsAt, endsAt, dateLabel, timeLabel, ageLabel, venue, city, posterImage, heroImage, salesState, ticketTheme, tickets }) => ({ slug, title, startsAt, endsAt, dateLabel, timeLabel, ageLabel, venue, city, posterImage, heroImage, salesState, ticketTheme, tickets: tickets.map(({ price }) => ({ price })) }))} />
      {!upcoming.length && <section className="landing-empty section-pad"><div className="section-label">02 / АФИША</div><h2>НОВЫЙ ВЕЧЕР<br />ВПЕРЕДИ.</h2><p>Готовим следующую встречу. Анонс и билеты появятся здесь.</p><Link className="text-link" href="/events">Наши события <span aria-hidden="true">↗</span></Link></section>}
      <HomePhotos photos={photos} />

      <section className="landing-final section-pad"><div className="section-label">ДО ВСТРЕЧИ</div><h2>УВИДИМСЯ<br />НА AGAYO.</h2><p>Выбери вечер. Дальше встретимся вживую.</p><Link className="button-link button-link-accent" href={agendaHref}>Выбрать событие <span aria-hidden="true">↗</span></Link></section>
      <footer className="footer"><div><div className="footer-brand">AGAYO<span className="brand-dot">.</span></div><p>Проживи так, чтобы вспомнить.</p><p>ИП Ергин Сергей Валентинович · ИНН 121524098311</p></div><div className="footer-links"><Link href="/events">Мероприятия</Link><Link href="/gallery">Галерея</Link><Link href="/about">О нас</Link><Link href="/profile" prefetch={false}>Профиль</Link><Link href="/legal">Правовая информация</Link></div><div className="footer-bottom"><span>Мы — свои</span><span>© AGAYO 2023–{new Date().getFullYear()}</span></div></footer>
    </main>
  );
}
