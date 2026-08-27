import Link from "next/link";

const events = [
  { date: "29.08.26", title: "AGAYO NIGHT", meta: "14+ · 18:00—21:00", href: "/events/agayo-night" },
  { date: "09.08.26", title: "SUMMER / 01", meta: "14+ · 18:00—21:00", href: "/events/summer-01" },
  { date: "26.07.26", title: "CLUBSHOW", meta: "14+ · 18:00—21:00", href: "/events/clubshow" },
];

export default function EventsPage() {
  return (
    <main className="inner-page">
      <header className="inner-header">
        <Link href="/" className="brand" aria-label="AGAYO">
          AGAYO<span className="brand-dot">.</span>
        </Link>
        <Link href="/profile" className="header-action">Профиль</Link>
      </header>
      <div className="inner-wrap">
        <div className="section-label">01 / МЕРОПРИЯТИЯ</div>
        <h1 className="inner-title">ТЫ ИДЁШЬ?</h1>
        <p className="inner-lead">Выбирай событие, которое хочется прожить, а потом вспомнить.</p>
        <div className="event-list">
          {events.map((event) => (
            <Link href={event.href} className="event-list-item" key={event.title}>
              <span>{event.date}</span>
              <strong>{event.title}</strong>
              <span>{event.meta}</span>
              <b>↗</b>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
