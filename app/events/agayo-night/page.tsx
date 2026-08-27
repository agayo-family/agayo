import Link from "next/link";
import Image from "next/image";

export default function EventPage() {
  return (
    <main className="event-page">
      <header className="inner-header event-header">
        <Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link>
        <Link href="/events" className="header-action">Все мероприятия</Link>
      </header>
      <section className="event-hero-page">
        <Image src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1800&q=90" alt="AGAYO NIGHT" fill priority sizes="100vw" className="event-page-image" />
        <div className="event-page-shade" />
        <div className="event-page-content">
          <span>29.08.26 · ЙОШКАР-ОЛА · 14+</span>
          <h1>AGAYO<br />NIGHT</h1>
          <p>18:00—21:00 · Alcohol Free</p>
        </div>
      </section>
      <section className="event-detail-grid">
        <div>
          <div className="section-label">О СОБЫТИИ</div>
          <h2>ТРИ ЧАСА,<br />КОТОРЫЕ<br />ЗАПОМНЯТСЯ.</h2>
        </div>
        <div className="event-detail-copy">
          <p>Музыка, свет и люди, которых ты раньше не знал. Возможно, после этого вечера узнаешь.</p>
          <p>Без алкоголя. Без необходимости быть кем-то другим. Просто приходи и проживи этот вечер.</p>
          <Link className="button-link button-link-accent" href="/events/agayo-night/tickets">Выбрать билет <span>↗</span></Link>
        </div>
      </section>
    </main>
  );
}
