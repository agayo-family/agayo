import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getPublishedEventsServer } from "@/lib/server/events";

export const dynamic = "force-dynamic";
export default async function EventsPage() {
  const events = await getPublishedEventsServer();
  return (
    <main className="inner-page">
      <SiteHeader />
      <div className="inner-wrap">
        <div className="section-label">01 / МЕРОПРИЯТИЯ</div>
        <h1 className="inner-title">ТЫ ИДЁШЬ?</h1>
        <p className="inner-lead">Будущие события и архив AGAYO в одном месте.</p>
        <div className="event-list">
          {events.filter((event) => event.status === "published").map((event) => (
            <Link href={`/events/${event.slug}`} className="event-list-item" key={event.slug}>
              <span>{event.dateLabel}</span><strong>{event.title}</strong><span>{event.ageLabel} · {event.timeLabel}</span><b>{event.salesState === "open" ? "БИЛЕТЫ ↗" : "АРХИВ ↗"}</b>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
