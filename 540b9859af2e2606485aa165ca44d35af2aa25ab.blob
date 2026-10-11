import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import HalloweenArt from "@/components/HalloweenArt";
import HalloweenExperience from "@/components/HalloweenExperience";
import { isHalloweenEvent } from "@/lib/event-presentation";
import { formatPrice, getEventCatalogBadge } from "@/lib/events";
import { getEventServer } from "@/lib/server/events";
import { canAccessEvent, getCurrentAdminAccess, hasPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventServer(slug);
  if (!event || event.status !== "published") return { title: "Мероприятие", robots: { index: false, follow: false } };
  const url = `/events/${encodeURIComponent(event.slug)}`;
  const description = event.description || `${event.title} · ${event.dateLabel} · ${event.city}`;
  return { title: event.title, description, alternates: { canonical: url }, openGraph: {
    title: event.title, description, url, images: [{ url: event.posterImage ?? event.heroImage }],
  } };
}


export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const event = await getEventServer(slug);
  if (!event) notFound();

  let adminPreview = false;
  if (event.status !== "published" && query.preview === "admin") {
    const access = await getCurrentAdminAccess();
    adminPreview = Boolean(access && hasPermission(access, "manage_events") && canAccessEvent(access, event.slug));
  }
  if (event.status !== "published" && !adminPreview) notFound();

  const catalogBadge = getEventCatalogBadge(event);
  const salesOpen = catalogBadge === "tickets";
  const isArchive = catalogBadge === "archive";
  const hasAvailableTickets = event.tickets.some((ticket) => !ticket.soldOut);
  const soldOut = salesOpen && event.tickets.length > 0 && !hasAvailableTickets;
  const isNight = event.slug === "agayo-night";
  const halloween = isHalloweenEvent(event);
  const theme = event.ticketTheme ?? { primary: "#111111", secondary: "#4b0f19", accent: "#c21f39" };
  const eventStyle = { "--event-primary": theme.primary, "--event-secondary": theme.secondary, "--event-accent": theme.accent } as CSSProperties;
  const eventHeroImage = event.posterImage ?? event.heroImage;

  return (
    <>{halloween && !adminPreview && <HalloweenExperience key={event.slug} slug={event.slug} />}<main id="main-content" className={`event-page-v2 ${event.ticketTheme ? "event-page-themed" : ""} ${halloween ? 'halloween-event-page' : ''}`} style={eventStyle}>
      <div className="event-header-shell"><SiteHeader /></div>
      {adminPreview ? <div className="event-admin-preview-banner">ПРЕДПРОСМОТР · ЭТА СТРАНИЦА ЕЩЁ НЕ ОПУБЛИКОВАНА ДЛЯ ГОСТЕЙ</div> : null}
      <section className="event-v2-hero">
        <Image src={eventHeroImage} alt={`Афиша ${event.title}`} fill priority sizes="100vw" className="event-v2-hero-image" />
        <div className="event-v2-hero-overlay" />
        {halloween && <HalloweenArt />}
        <div className="event-v2-hero-content">
          <div className="event-v2-kicker">{event.dateLabel} · {event.city.toUpperCase()} · {event.ageLabel}</div>
          <h1>{event.title}</h1>
          <div className="event-v2-hero-bottom"><p>{event.timeLabel} · {event.alcoholFree ? "Alcohol Free" : ""}</p><Link href="#event-info" className="circle-link" aria-label="К информации">↓</Link></div>
          <div className="event-hero-actions">{salesOpen && hasAvailableTickets ? <Link className="button-link button-link-accent" href="#tickets">Выбрать билет <span>↗</span></Link> : <span className="event-sales-caption">{isArchive ? "Этот вечер уже стал историей" : soldOut ? "Все билеты разобрали" : "Билеты пока недоступны"}</span>}</div>
        </div>
      </section>

      <section id="event-info" className="event-v2-intro section-pad">
        <div className="section-label">01 / О СОБЫТИИ</div>
        <div className="event-v2-intro-grid">
          <h2>{isNight ? <>ТРИ ЧАСА,<br />КОТОРЫЕ<br />ЗАХОЧЕТСЯ<br />ВСПОМНИТЬ</> : salesOpen ? <>ЭТОТ ВЕЧЕР<br />НУЖНО<br />ПРОЖИТЬ</> : isArchive ? <>ТЫ БЫЛ<br />ЗДЕСЬ</> : <>СКОРО<br />УВИДИМСЯ</>}</h2>
          <div className="event-v2-copy">{(event.venue || event.address) && <div className="event-location"><span>ГДЕ ВСТРЕЧАЕМСЯ</span>{event.venue && <strong>{event.venue}</strong>}{event.address && <p>{event.address}</p>}</div>}<p>{event.description}</p><p>{event.secondaryDescription}</p><div className="tag-row"><span>{event.ageLabel}</span><span>{event.timeLabel}</span>{event.alcoholFree && <span>ALCOHOL FREE</span>}<span>{event.city}</span></div><Link className="event-rules-link" href={`/events/${encodeURIComponent(event.slug)}/rules${adminPreview ? "?preview=admin" : ""}`}>Правила мероприятия ↗</Link></div>
        </div>
      </section>

      {event.tickets.length > 0 && (
        <section id="tickets" className="event-v2-tickets section-pad">
          <div className="section-label">02 / БИЛЕТЫ</div>
          <div className="event-v2-section-head"><h2>{soldOut ? <>ВСЕ БИЛЕТЫ<br />РАЗОБРАЛИ</> : salesOpen ? <>ТЫ<br />ВНУТРИ?</> : isArchive ? <>ПРОДАЖИ<br />ЗАВЕРШЕНЫ</> : <>ПРОДАЖИ<br />СКОРО</>}</h2><p>{soldOut ? "В этой встрече больше нет свободных билетов." : salesOpen ? "Выбирай формат. Остальное сделаем мы." : isArchive ? "Это событие уже прошло. Билетные категории оставлены в архиве события." : "Мероприятие опубликовано, но продажи пока не открыты."}</p></div>
          <div className="ticket-grid">
            {event.tickets.map((ticket, index) => (
              <article className={`ticket-card ticket-tone-${index % 3} ${ticket.hotTickets?.enabled && salesOpen ? "ticket-card-hot" : ""}`} key={ticket.id}>
                <div className="ticket-card-top"><span>0{index + 1}</span>{ticket.hotTickets?.enabled && salesOpen && <b>ГОРЯЧИЕ БИЛЕТЫ · ОСТАЛОСЬ {ticket.hotTickets.displayedRemaining}</b>}</div>
                <h3>{ticket.name}</h3><p>{ticket.note}</p>
                <div className="ticket-card-bottom"><strong>{formatPrice(ticket.price)}</strong>{salesOpen && !ticket.soldOut ? <Link className="ticket-select" href={`/events/${encodeURIComponent(event.slug)}/checkout?category=${encodeURIComponent(ticket.id)}`} prefetch={false}>Выбрать ↗</Link> : <span className="ticket-closed">{ticket.soldOut ? "SOLD OUT" : "Закрыто"}</span>}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isNight && <section className="event-v2-map section-pad"><div className="section-label">03 / СХЕМА ЗАЛА</div><div className="event-v2-section-head"><h2>ВЫБЕРИ<br />СВОЮ ЗОНУ</h2><p>Для этого события используется продажа по зонам. Конкретные места будут доступны только у событий с режимом «места».</p></div><div className="hall-plan"><div className="hall-stage">AGAYO STAGE</div><div className="hall-zone hall-zone-a"><span>A</span><small>PREMIUM</small></div><div className="hall-zone hall-zone-b"><span>B</span><small>STANDARD</small></div><div className="hall-zone hall-zone-c"><span>C</span><small>STANDARD</small></div><div className="hall-zone hall-zone-vip"><span>VIP</span><small>VIP ZONE</small></div><div className="hall-entry">ВХОД</div></div></section>}

      {event.program.length > 0 && <section className="event-v2-program section-pad"><div className="section-label">{isNight ? "04" : "03"} / ПРОГРАММА</div><div className="program-list">{event.program.map(([time, title]) => <div className="program-row" key={`${time}-${title}`}><span>{time}</span><strong>{title}</strong></div>)}</div></section>}

      <section className="event-v2-final section-pad"><div className="section-label">{event.title} · {event.dateLabel}</div><h2>{salesOpen ? <>УВИДИМСЯ<br />ВНУТРИ</> : isArchive ? <>ЭТО УЖЕ<br />ПРОИЗОШЛО</> : <>СКОРО<br />УВИДИМСЯ</>}</h2>{salesOpen && hasAvailableTickets ? <Link href="#tickets" className="button-link button-link-accent">Выбрать билет <span>↗</span></Link> : <Link href={`/gallery?event=${encodeURIComponent(event.slug)}`} className="button-link button-link-accent">Смотреть фотографии <span>↗</span></Link>}</section>
    </main></>
  );
}
