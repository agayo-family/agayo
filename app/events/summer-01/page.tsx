import Link from "next/link";

export default function SummerPage() {
  return <EventStub title="SUMMER / 01" date="09.08.26" />;
}

function EventStub({ title, date }: { title: string; date: string }) {
  return (
    <main className="inner-page">
      <header className="inner-header"><Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link><Link href="/events" className="header-action">Все мероприятия</Link></header>
      <div className="inner-wrap event-stub">
        <div className="section-label">МЕРОПРИЯТИЕ · 14+ · ALCOHOL FREE</div>
        <h1 className="inner-title">{title}</h1>
        <p className="inner-lead">{date} · 18:00—21:00 · ЙОШКАР-ОЛА</p>
        <Link className="button-link button-link-accent" href="/events">Вернуться к мероприятиям <span>↗</span></Link>
      </div>
    </main>
  );
}
