import Image from "next/image";
import Link from "next/link";
import { formatPrice, getEventCatalogBadge, groupEventsByMonth, type AgayoEvent } from "@/lib/events";

function MonthGroup({ group }: { group: ReturnType<typeof groupEventsByMonth>[number] }) {
  return <section className="landing-agenda-month" aria-labelledby={`month-${group.key}`}>
    <div className="landing-month-heading"><h3 id={`month-${group.key}`}>{group.label}</h3><span>В афише: {group.events.length}</span></div>
    <div className={`landing-agenda-grid${group.events.length === 1 ? " is-single" : ""}`}>{group.events.map((event) => {
      const href = `/events/${encodeURIComponent(event.slug)}`;
      const salesOpen = getEventCatalogBadge(event) === "tickets" && event.tickets.length > 0;
      const prices = event.tickets.map((ticket) => ticket.price).filter((price) => Number.isFinite(price) && price >= 0);
      const price = prices.length ? Math.min(...prices) : null;
      const status = salesOpen ? "Билеты в продаже" : event.salesState === "coming-soon" ? "Билеты скоро" : "Продажа закрыта";
      return <article className="landing-agenda-card" key={event.slug}>
        <Link href={href} className="landing-agenda-cover" aria-label={`Подробнее: ${event.title}`}><Image src={event.posterImage || event.heroImage} alt={`Афиша ${event.title}`} fill sizes="(max-width: 600px) 86vw, (max-width: 1000px) 42vw, 28vw" /><span>{event.ageLabel}</span></Link>
        <div className="landing-agenda-card-content">
          <div className="landing-agenda-date"><time dateTime={event.startsAt}>{event.dateLabel}</time><span>{event.timeLabel}</span></div>
          <h4><Link href={href}>{event.title}</Link></h4>
          <p className="landing-agenda-place">{event.venue || event.city}{event.venue && <span>{event.city}</span>}</p>
          <div className="landing-agenda-status"><i className={salesOpen ? "is-open" : ""} aria-hidden="true" />{status}</div>
          <Link className="button-link" href={`${href}${salesOpen ? "#tickets" : ""}`} aria-label={`${event.title}: ${salesOpen ? "выбрать билеты" : "подробности события"}`}>{salesOpen ? price !== null ? `Билеты от ${formatPrice(price)}` : "Выбрать билеты" : "Подробнее о событии"}<span aria-hidden="true">↗</span></Link>
        </div>
      </article>;
    })}</div>
  </section>;
}

export default function UpcomingAgenda({ events }: { events: AgayoEvent[] }) {
  if (!events.length) return null;
  const groups = groupEventsByMonth(events);
  const visible = groups.slice(0, 2);
  const later = groups.slice(2);
  return <section id="upcoming-events" className="landing-agenda section-pad" aria-labelledby="landing-agenda-title">
    <div className="section-label">01 / АФИША</div>
    <div className="landing-section-heading"><h2 id="landing-agenda-title">ТВОЙ<br />СЛЕДУЮЩИЙ ВЕЧЕР.</h2><div className="landing-agenda-heading-note"><Link className="text-link" href="/events">Вся афиша и архив ↗</Link></div></div>
    {visible.map((group) => <MonthGroup group={group} key={group.key} />)}
    {later.length > 0 && <details className="landing-agenda-later"><summary>Другие даты <span aria-hidden="true">+</span></summary>{later.map((group) => <MonthGroup group={group} key={group.key} />)}</details>}
  </section>;
}
