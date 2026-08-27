import Link from "next/link";

export default function ClubshowPage() {
  return (
    <main className="inner-page">
      <header className="inner-header"><Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link><Link href="/events" className="header-action">Все мероприятия</Link></header>
      <div className="inner-wrap event-stub">
        <div className="section-label">МЕРОПРИЯТИЕ · 14+ · ALCOHOL FREE</div>
        <h1 className="inner-title">CLUBSHOW</h1>
        <p className="inner-lead">26.07.26 · 18:00—21:00 · ЙОШКАР-ОЛА</p>
        <Link className="button-link button-link-accent" href="/events">Вернуться к мероприятиям <span>↗</span></Link>
      </div>
    </main>
  );
}
