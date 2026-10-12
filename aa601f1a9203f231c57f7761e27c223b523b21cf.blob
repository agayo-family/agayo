import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { getPublicCatalog } from "@/lib/server/public-content";
import { AgayoEvent, getEventCatalogBadge, partitionEvents } from "@/lib/events";

export const revalidate = 60;
export const metadata: Metadata = { title: "Мероприятия", alternates: { canonical: "/events" } };

function EventList({ events }: { events: AgayoEvent[] }) {
  return <div className="event-list">{events.map((event) => {
    const badge = getEventCatalogBadge(event);
    const label = badge === "archive" ? "АРХИВ" : badge === "tickets" ? "БИЛЕТЫ" : "СКОРО";
    return <Link href={`/events/${encodeURIComponent(event.slug)}`} className="event-list-item" key={event.slug}><span>{event.dateLabel}</span><strong style={{ color: badge === "archive" ? "var(--burgundy-bright)" : "var(--paper)" }}>{event.title}</strong><span>{event.ageLabel} · {event.timeLabel}</span><b>{label} ↗</b></Link>;
  })}</div>;
}

export default async function EventsPage() {
  const { upcoming, archive } = partitionEvents(await getPublicCatalog());
  return <main id="main-content" className="inner-page"><SiteHeader /><div className="inner-wrap">
    <div className="section-label">01 / МЕРОПРИЯТИЯ</div><h1 className="inner-title">ТЫ ИДЁШЬ?</h1><p className="inner-lead">Выбери следующий вечер. Прошедшие встречи — в архиве ниже.</p>
    <section className="catalog-section" aria-labelledby="upcoming-title"><h2 id="upcoming-title" className="catalog-title">СКОРО ВСТРЕТИМСЯ <span>{upcoming.length}</span></h2>{upcoming.length ? <EventList events={upcoming} /> : <div className="catalog-empty"><p>Новое событие пока не анонсировано.</p><Link className="text-link" href="/gallery">Вспомнить прошлые вечера ↗</Link></div>}</section>
    {archive.length > 0 && <section className="catalog-section" aria-labelledby="archive-title"><h2 id="archive-title" className="catalog-title">НАША ИСТОРИЯ <span>{archive.length}</span></h2><EventList events={archive} /></section>}
  </div></main>;
}
