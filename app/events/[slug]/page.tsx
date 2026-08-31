import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { events, formatPrice, getEvent } from "@/lib/events";

export function generateStaticParams() {
  return events.map((event) => ({ slug: event.slug }));
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getEvent(slug);
  if (!event || event.status !== "published") notFound();

  const salesOpen = event.salesState === "open";
  const isNight = event.slug === "agayo-night";

  return (
    <main className="event-page-v2">
      <div className="event-header-shell"><SiteHeader /></div>
      <section className="event-v2-hero">
        <Image src={event.heroImage} alt={event.title} fill priority sizes="100vw" className="event-v2-hero-image" />
        <div className="event-v2-hero-overlay" />
        <div className="event-v2-hero-content">
          <div className="event-v2-kicker">{event.dateLabel} · {event.city.toUpperCase()} · {event.ageLabel}</div>
          <h1>{event.title.split(" ").map((part, index) => <span key={part} className={index ? "event-title-secondary" : undefined}>{part}{index < event.title.split(" ").length - 1 ? <br /> : null}</span>)}</h1>
          <div className="event-v2-hero-bottom"><p>{event.timeLabel} · {event.alcoholFree ? "Alcohol Free" : ""}</p><Link href="#event-info" className="circle-link" aria-label="К информации">↓</Link></div>
        </div>
      </section>

      <section id="event-info" className="event-v2-intro section-pad">
        <div className="section-label">01 / О СОБЫТИИ</div>
        <div className="event-v2-intro-grid">
          <h2>{isNight ? <>ТРИ ЧАСА,<br />КОТОРЫЕ<br />ЗАХОЧЕТСЯ<br />ВСПОМНИТЬ</> : <>ТЫ БЫЛ<br />ЗДЕСЬ</>}</h2>
          <div className="event-v2-copy"><p>{event.description}</p><p>{event.secondaryDescription}</p><div className="tag-row"><span>{event.ageLabel}</span><span>{event.timeLabel}</span>{event.alcoholFree && <span>ALCOHOL FREE</span>}<span>{event.city}</span></div></div>
        </div>
      </section>

      {event.tickets.length > 0 && (
        <section id="tickets" className="event-v2-tickets section-pad">
          <div className="section-label">02 / БИЛЕТЫ</div>
          <div className="event-v2-section-head"><h2>{salesOpen ? <>ТЫ<br />ВНУТРИ?</> : <>ПРОДАЖИ<br />ЗАВЕРШЕНЫ</>}</h2><p>{salesOpen ? "Выбирай формат. Остальное сделаем мы." : "Это событие уже прошло. Билетные категории оставлены в архиве события."}</p></div>
          <div className="ticket-grid">
            {event.tickets.map((ticket, index) => (
              <article className={`ticket-card ${ticket.hotTickets?.enabled && salesOpen ? "ticket-card-hot" : ""}`} key={ticket.id}>
                <div className="ticket-card-top"><span>0{index + 1}</span>{ticket.hotTickets?.enabled && salesOpen && <b>ГОРЯЧИЕ БИЛЕТЫ · ОСТАЛОСЬ {ticket.hotTickets.displayedRemaining}</b>}</div>
                <h3>{ticket.name}</h3><p>{ticket.note}</p>
                <div className="ticket-card-bottom"><strong>{formatPrice(ticket.price)}</strong>{salesOpen ? <Link className="ticket-select" href={`/events/${event.slug}/checkout?category=${ticket.id}`}>Выбрать ↗</Link> : <span className="ticket-closed">Закрыто</span>}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isNight && (
        <>
          <section className="event-v2-map section-pad"><div className="section-label">03 / СХЕМА ЗАЛА</div><div className="event-v2-section-head"><h2>ВЫБЕРИ<br />СВОЮ ЗОНУ</h2><p>Для этого события используется продажа по зонам. Конкретные места будут доступны только у событий с режимом «места».</p></div><div className="hall-plan"><div className="hall-stage">AGAYO STAGE</div><div className="hall-zone hall-zone-a"><span>A</span><small>PREMIUM</small></div><div className="hall-zone hall-zone-b"><span>B</span><small>STANDARD</small></div><div className="hall-zone hall-zone-c"><span>C</span><small>STANDARD</small></div><div className="hall-zone hall-zone-vip"><span>VIP</span><small>VIP ZONE</small></div><div className="hall-entry">ВХОД</div></div></section>
          {event.program.length > 0 && <section className="event-v2-program section-pad"><div className="section-label">04 / ПРОГРАММА</div><div className="program-list">{event.program.map(([time, title]) => <div className="program-row" key={time}><span>{time}</span><strong>{title}</strong></div>)}</div></section>}
        </>
      )}

      <section className="event-v2-final section-pad"><div className="section-label">{event.title} · {event.dateLabel}</div><h2>{salesOpen ? <>УВИДИМСЯ<br />ВНУТРИ</> : <>ЭТО УЖЕ<br />ПРОИЗОШЛО</>}</h2><Link href="/gallery" className="button-link button-link-accent">Смотреть фотографии <span>↗</span></Link></section>
    </main>
  );
}
