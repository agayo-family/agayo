import Image from "next/image";
import Link from "next/link";

const events = [
  {
    date: "29.08.26",
    title: "AGAYO NIGHT",
    meta: "14+ · 18:00—21:00",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=85",
  },
  {
    date: "09.08.26",
    title: "SUMMER / 01",
    meta: "14+ · 18:00—21:00",
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
  },
  {
    date: "26.07.26",
    title: "CLUBSHOW",
    meta: "14+ · 18:00—21:00",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand-logo" href="/" aria-label="AGAYO">
          <Image src="/agayo-logo.svg" alt="AGAYO" width={118} height={32} priority />
        </Link>
        <nav className="desktop-nav" aria-label="Основная навигация">
          <Link href="/events">Мероприятия</Link>
          <Link href="/gallery">Галерея</Link>
          <Link href="/about">AGAYO</Link>
        </nav>
        <Link className="profile-link" href="/profile">Профиль</Link>
        <Link className="menu-button" href="/events" aria-label="Открыть мероприятия"><span /><span /></Link>
      </header>

      <section className="hero">
        <Image src={events[0].image} alt="Толпа на музыкальном мероприятии" fill priority sizes="100vw" className="hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="eyebrow">AGAYO · ЙОШКАР-ОЛА</div>
          <h1>Создавай<br />воспоминания,<br />а не провалы<br />в памяти</h1>
          <div className="hero-bottom">
            <p>Мероприятия для тех, кто хочет прожить молодость так, чтобы её захотелось вспомнить.</p>
            <Link className="circle-link" href="/events" aria-label="К мероприятиям">↓</Link>
          </div>
        </div>
      </section>

      <section className="intro section-pad">
        <div className="section-label">01 / СВОИ</div>
        <div className="intro-grid">
          <h2>МЫ — СВОИ.</h2>
          <div className="intro-copy">
            <p>Мы обычные подростки. Учимся, гуляем, знакомимся, смеёмся над тупыми шутками и иногда вообще не знаем, чем заняться вечером.</p>
            <p>Поэтому мы создаём вечера, которые сами хотели бы прожить.</p>
            <Link className="text-link dark-link" href="/about">Узнать больше <span>↗</span></Link>
            <div className="tag-row"><span>14+</span><span>18:00—21:00</span><span>Alcohol Free</span></div>
          </div>
        </div>
      </section>

      <section className="formats section-pad">
        <div className="section-label">02 / ФОРМАТ</div>
        <div className="format-list">
          <Link href="/events" className="format-item"><span>01</span><strong>ВЕЧЕРИНКИ</strong><b>↗</b></Link>
          <Link href="/events" className="format-item"><span>02</span><strong>КОНЦЕРТЫ</strong><b>↗</b></Link>
          <Link href="/events" className="format-item"><span>03</span><strong>КЛАБШОУ</strong><b>↗</b></Link>
        </div>
      </section>

      <section className="next-event section-pad">
        <div className="section-label">03 / СЛЕДУЮЩЕЕ</div>
        <div className="event-feature">
          <div className="event-image-wrap"><Image src={events[0].image} alt="AGAYO NIGHT" fill sizes="(max-width: 900px) 100vw, 55vw" className="event-image" /></div>
          <div className="event-copy">
            <div className="event-date">29.08.26</div>
            <h2>AGAYO<br />NIGHT</h2>
            <p className="event-meta">14+ · 18:00—21:00 · ЙОШКАР-ОЛА</p>
            <p className="event-description">Три часа музыки, света и людей, которых ты раньше не знал. Возможно, после этого вечера узнаешь.</p>
            <Link className="button-link" href="/events/agayo-night">Посмотреть событие <span>↗</span></Link>
          </div>
        </div>
      </section>

      <section className="statement section-pad">
        <div className="statement-mark">AGAYO</div>
        <h2>ОДНАЖДЫ ТЫ БУДЕШЬ ВСПОМИНАТЬ ЭТО ВРЕМЯ.</h2>
        <p>Мы хотим, чтобы тебе было что вспомнить.</p>
      </section>

      <section className="archive section-pad">
        <div className="section-label">04 / ТЕ САМЫЕ ВЕЧЕРА</div>
        <div className="archive-grid">
          {events.slice(1).map((event, index) => (
            <Link href="/gallery" className={index === 0 ? "archive-card archive-card-large" : "archive-card"} key={event.title}>
              <div className="archive-image-wrap">
                <Image src={event.image} alt={event.title} fill sizes="(max-width: 900px) 100vw, 50vw" className="archive-image" />
                <span className="favorite-button" aria-hidden="true">♡</span>
              </div>
              <div className="archive-meta"><span>{event.date}</span><strong>{event.title}</strong><span>{event.meta}</span></div>
            </Link>
          ))}
        </div>
        <Link className="text-link" href="/gallery">Смотреть все фотографии <span>↗</span></Link>
      </section>

      <section className="voices section-pad">
        <div className="section-label">05 / ГОЛОСА</div>
        <Link href="/about" className="voice-card">
          <span className="voice-play" aria-hidden="true">▶</span>
          <div className="voice-content"><div className="voice-wave" aria-hidden="true">▁▂▃▄▆▇▆▄▅▇▆▄▂▃▅▆▇▅▄▂</div><p>«Я вообще не хотела идти. Хорошо, что друзья заставили.»</p><span>Алина, 16</span></div>
        </Link>
      </section>

      <section className="final-cta section-pad">
        <div className="section-label">06 / ДО ВСТРЕЧИ</div>
        <h2>ТЫ ИДЁШЬ?</h2>
        <p>Следующее событие уже ждёт тебя.</p>
        <Link className="button-link button-link-accent" href="/events/agayo-night">Посмотреть событие <span>↗</span></Link>
      </section>

      <footer className="footer">
        <div><div className="footer-brand">AGAYO<span className="brand-dot">.</span></div><p>Проживи так, чтобы вспомнить.</p></div>
        <div className="footer-links"><Link href="/events">Мероприятия</Link><Link href="/gallery">Галерея</Link><Link href="/about">AGAYO</Link><Link href="/profile">Профиль</Link></div>
        <div className="footer-bottom"><span>Telegram · VK</span><span>© AGAYO 2023</span></div>
      </footer>
    </main>
  );
}
