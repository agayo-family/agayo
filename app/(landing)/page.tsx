import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import VoiceReview from "@/components/VoiceReview";
import { formatPrice, getEventCatalogBadge, partitionEvents } from "@/lib/events";
import { getFeaturedReview, getPublicCatalog, getPublicPhotos, getPublicProgram } from "@/lib/server/public-content";
import "./landing.css";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const upcoming = partitionEvents(await getPublicCatalog()).upcoming[0];
  const title = upcoming ? `${upcoming.title} · ${upcoming.dateLabel}` : "AGAYO — следующий вечер впереди";
  const description = upcoming
    ? `${upcoming.title}: ${upcoming.dateLabel}, ${upcoming.timeLabel}, ${upcoming.city}. ${upcoming.ageLabel}. Программа и билеты на событие AGAYO.`
    : "Вечеринки, концерты и клабшоу AGAYO в Йошкар-Оле. Фотографии прошлых встреч и анонсы следующих событий.";
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
  const { upcoming: upcomingEvents, archive } = partitionEvents(events);
  const upcoming = upcomingEvents[0];
  const program = upcoming ? await getPublicProgram(upcoming.slug) : [];
  const upcomingHref = upcoming ? `/events/${encodeURIComponent(upcoming.slug)}` : "/events";
  const salesOpen = Boolean(upcoming && getEventCatalogBadge(upcoming) === "tickets" && upcoming.tickets.length);
  const ticketPrices = upcoming?.tickets.map((ticket) => ticket.price).filter((price) => Number.isFinite(price) && price >= 0) ?? [];
  const startingPrice = ticketPrices.length ? Math.min(...ticketPrices) : null;
  const salesCaption = salesOpen ? "Билеты в продаже" : upcoming?.salesState === "coming-soon" ? "Билеты скоро" : "Продажа закрыта";
  const cover = upcoming?.posterImage ?? upcoming?.heroImage ?? mediaPhotos[0]?.src ?? archive[0]?.posterImage ?? "/events/vernite-lampovost-poster.jpg";
  const memories = mediaPhotos.slice(0, 3);

  return (
    <main id="main-content" className="home-page event-landing">
      <SiteHeader overlay />
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span className="landing-live-dot" aria-hidden="true" />{upcoming ? "Ближайшее событие" : "AGAYO · Мы — свои"}</div>
          <h1 id="landing-title">{upcoming?.title ?? "Следующий вечер — скоро"}</h1>
          <p className="landing-hero-meta">{upcoming ? <><time dateTime={upcoming.startsAt}>{upcoming.dateLabel}</time><span>{upcoming.timeLabel}</span><span>{upcoming.city}</span></> : "Создаём вечера, которые захочется вспомнить. Следи за новыми анонсами."}</p>
          {upcoming && <div className="landing-tags"><span>{upcoming.ageLabel}</span>{upcoming.alcoholFree && <span>Без алкоголя</span>}<span>{salesCaption}</span></div>}
          <div className="landing-actions">
            <Link className="button-link button-link-accent" href={upcoming ? "#landing-tickets" : "/events"}>{salesOpen ? "Выбрать билет" : upcoming ? "О билетах" : "Все события"}<span aria-hidden="true">↗</span></Link>
            <Link className="landing-secondary-link" href={upcoming ? "#next-event" : "/gallery"}>{upcoming ? "Как всё будет" : "Как это было"}<span aria-hidden="true">↓</span></Link>
          </div>
          <div className="hero-booking landing-booking"><div><span>{upcoming ? "ВСТРЕЧАЕМСЯ" : "ПРОЖИВИ ТАК, ЧТОБЫ ВСПОМНИТЬ"}</span><strong>{upcoming?.venue ?? (upcoming ? upcoming.city : "AGAYO")}</strong>{upcoming?.address && <small>{upcoming.address}</small>}</div>{salesOpen && startingPrice !== null && <div className="landing-starting-price"><span>БИЛЕТЫ ОТ</span><strong>{formatPrice(startingPrice)}</strong></div>}</div>
        </div>
        <div className="landing-poster"><Image src={cover} alt={upcoming ? `Афиша ${upcoming.title}` : "Один из вечеров AGAYO"} fill priority sizes="(max-width: 900px) 90vw, 43vw" className="landing-poster-image" /><div className="landing-poster-caption"><span>AGAYO FAMILY</span><span>{upcoming?.dateLabel ?? "МЫ — СВОИ"}</span></div></div>
        <div className="landing-hero-foot"><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span><Link href={upcoming || !memories.length ? "#next-event" : "#memories"} aria-label="Перейти к подробностям">↓</Link><span>{upcoming?.city ?? "ЙОШКАР-ОЛА"}</span></div>
      </section>

      {upcoming ? <>
        <section id="next-event" className="landing-details section-pad" aria-labelledby="landing-details-title">
          <div className="section-label">01 / ТВОЙ СЛЕДУЮЩИЙ ВЕЧЕР</div>
          <div className="landing-details-grid"><div><h2 id="landing-details-title">Встретимся.<br />Запомним.</h2>{upcoming.description && <p>{upcoming.description}</p>}{upcoming.secondaryDescription && <p>{upcoming.secondaryDescription}</p>}<Link className="text-link" href={upcomingHref}>Подробности события <span aria-hidden="true">↗</span></Link></div><dl className="landing-facts"><div><dt>КОГДА</dt><dd><time dateTime={upcoming.startsAt}>{upcoming.dateLabel}</time><small>{upcoming.timeLabel}</small></dd></div><div><dt>ГДЕ</dt><dd>{upcoming.venue ?? upcoming.city}<small>{upcoming.address ?? upcoming.city}</small></dd></div><div><dt>ДЛЯ КОГО</dt><dd>{upcoming.ageLabel}</dd></div><div><dt>ФОРМАТ</dt><dd>{upcoming.alcoholFree ? "Без алкоголя" : "Событие AGAYO"}</dd></div></dl></div>
        </section>

        {program.length > 0 && <section className="landing-program section-pad" aria-labelledby="landing-program-title"><div className="section-label">02 / ПРОГРАММА</div><div className="landing-section-heading"><h2 id="landing-program-title">В ритме<br />вечера</h2><p>Сохрани дату.<br />Всё остальное — здесь.</p></div><ol className="landing-timeline">{program.map(([time, title], index) => <li key={`${time}-${index}`}><span className="landing-program-time">{time}</span><h3>{title}</h3><span className="landing-program-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></li>)}</ol></section>}

        <section id="landing-tickets" className="landing-tickets section-pad" aria-labelledby="landing-tickets-title"><div className="section-label">03 / БИЛЕТЫ</div><div className="landing-section-heading"><h2 id="landing-tickets-title">Твой вход<br />в этот вечер</h2><p>{salesOpen ? "Выбери категорию. Билет появится в профиле после оплаты." : upcoming.salesState === "coming-soon" ? "Открытие продаж — впереди. Заглядывай за обновлениями." : "Сейчас продажа билетов закрыта."}</p></div>{upcoming.tickets.length > 0 && <div className="landing-ticket-grid">{upcoming.tickets.map((ticket, index) => <article className="landing-ticket-card" key={ticket.id}><div className="landing-ticket-top"><span>AGAYO / {String(index + 1).padStart(2, "0")}</span><span>{upcoming.ageLabel}</span></div><h3>{ticket.name}</h3><div className="landing-ticket-price">{formatPrice(ticket.price)}</div><div className="landing-ticket-date">{upcoming.dateLabel} · {upcoming.timeLabel}</div>{salesOpen ? <Link className="button-link" href={`${upcomingHref}/checkout?category=${encodeURIComponent(ticket.id)}`} prefetch={false} aria-label={`Выбрать билет ${ticket.name} за ${formatPrice(ticket.price)}`}>Выбрать билет <span aria-hidden="true">↗</span></Link> : <span className="landing-ticket-closed">{salesCaption}</span>}</article>)}</div>}<div className="landing-ticket-help"><p>{salesOpen ? "Актуальное наличие билетов проверяется при оформлении." : "Следи за статусом продаж на странице события."}</p><Link href={`${upcomingHref}/rules`}>Правила события ↗</Link></div></section>
      </> : <section id="next-event" className="landing-details section-pad"><div className="section-label">01 / ПРОДОЛЖЕНИЕ СЛЕДУЕТ</div><div className="landing-details-grid"><h2>Скоро<br />увидимся.</h2><div><p>Готовим следующую встречу. Здесь появятся её афиша, программа и билеты, когда событие будет опубликовано.</p><Link className="text-link" href="/events">Наши события <span aria-hidden="true">↗</span></Link></div></div></section>}

      {memories.length > 0 && <section id="memories" className="landing-memories section-pad" aria-labelledby="landing-memories-title"><div className="section-label">04 / КАК ЭТО БЫЛО</div><div className="landing-section-heading"><h2 id="landing-memories-title">Лица.<br />Моменты. Мы.</h2><Link className="text-link" href="/gallery">Вся галерея <span aria-hidden="true">↗</span></Link></div><div className="landing-photo-grid">{memories.map((photo) => <Link key={photo.id} className="landing-photo" href={`/gallery?event=${encodeURIComponent(photo.eventSlug)}`} aria-label={`Фотографии события ${photo.eventTitle}`}><div><Image src={photo.src} alt={photo.caption ?? `Вечер ${photo.eventTitle}`} fill sizes="(max-width: 600px) 90vw, (max-width: 900px) 45vw, 29vw" /></div><span>{photo.eventTitle}<b aria-hidden="true">↗</b></span></Link>)}</div></section>}

      {featuredReview && <section className="voices section-pad"><div className="section-label">05 / ГОЛОСА ПОСЛЕ ВЕЧЕРА</div><VoiceReview audioSrc={featuredReview.audioUrl} text={featuredReview.text} author={featuredReview.author} /></section>}
      <section className="landing-team section-pad"><span className="section-label">AGAYO / МЫ — СВОИ</span><h2>Создаём вечера,<br />которые сами<br />хотели бы прожить.</h2><Link className="text-link" href="/about">Познакомиться с командой <span aria-hidden="true">↗</span></Link></section>
      <section className="landing-final section-pad"><div className="section-label">ДО ВСТРЕЧИ</div><h2>{upcoming ? "Увидимся там." : "Увидимся скоро."}</h2><p>{upcoming ? `${upcoming.dateLabel} · ${upcoming.timeLabel} · ${upcoming.venue ?? upcoming.city}` : "Новый анонс уже впереди. А пока — наши события и фотографии."}</p><Link className="button-link button-link-accent" href={upcoming ? "#landing-tickets" : "/events"}>{salesOpen ? "Выбрать билет" : upcoming ? "Статус билетов" : "Все события"}<span aria-hidden="true">↗</span></Link></section>
      <footer className="footer"><div><div className="footer-brand">AGAYO<span className="brand-dot">.</span></div><p>Проживи так, чтобы вспомнить.</p><p>ИП Ергин Сергей Валентинович · ИНН 121524098311</p></div><div className="footer-links"><Link href="/events">Мероприятия</Link><Link href="/gallery">Галерея</Link><Link href="/about">О нас</Link><Link href="/profile" prefetch={false}>Профиль</Link><Link href="/legal">Правовая информация</Link></div><div className="footer-bottom"><span>Мы — свои</span><span>© AGAYO 2023–{new Date().getFullYear()}</span></div></footer>
    </main>
  );
}
