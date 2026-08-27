import Image from "next/image";
import Link from "next/link";

const tickets = [
  {
    name: "STANDARD",
    price: "700 ₽",
    note: "Вход на мероприятие",
  },
  {
    name: "PREMIUM",
    price: "1 200 ₽",
    note: "Приоритетный вход · специальный мерч",
    hot: true,
  },
  {
    name: "VIP",
    price: "2 000 ₽",
    note: "Отдельная зона · максимум привилегий",
  },
];

const program = [
  ["18:00", "Открытие дверей"],
  ["18:30", "Разогрев · DJ set"],
  ["19:15", "Основная программа"],
  ["20:15", "Кульминация вечера"],
  ["21:00", "Финал"],
];

export default function EventPage() {
  return (
    <main className="event-page-v2">
      <header className="inner-header event-header-v2">
        <Link href="/" className="brand" aria-label="AGAYO">
          AGAYO<span className="brand-dot">.</span>
        </Link>
        <Link href="/events" className="header-action">
          Все мероприятия ↗
        </Link>
      </header>

      <section className="event-v2-hero">
        <Image
          src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=2200&q=90"
          alt="AGAYO NIGHT"
          fill
          priority
          sizes="100vw"
          className="event-v2-hero-image"
        />
        <div className="event-v2-hero-overlay" />
        <div className="event-v2-hero-content">
          <div className="event-v2-kicker">29.08.26 · ЙОШКАР-ОЛА · 14+</div>
          <h1>AGAYO<br /><span>NIGHT</span></h1>
          <div className="event-v2-hero-bottom">
            <p>18:00—21:00 · Alcohol Free</p>
            <Link href="#tickets" className="circle-link" aria-label="К билетам">↓</Link>
          </div>
        </div>
      </section>

      <section className="event-v2-intro section-pad">
        <div className="section-label">01 / О СОБЫТИИ</div>
        <div className="event-v2-intro-grid">
          <h2>ТРИ ЧАСА,<br />КОТОРЫЕ<br />ЗАХОЧЕТСЯ<br />ВСПОМНИТЬ.</h2>
          <div className="event-v2-copy">
            <p>Музыка, свет и люди, которых ты раньше не знал. Возможно, после этого вечера узнаешь.</p>
            <p>Без алкоголя. Без необходимости быть кем-то другим. Просто приходи и проживи этот вечер вместе с нами.</p>
            <div className="tag-row">
              <span>14+</span>
              <span>18:00—21:00</span>
              <span>ALCOHOL FREE</span>
              <span>ЙОШКАР-ОЛА</span>
            </div>
          </div>
        </div>
      </section>

      <section id="tickets" className="event-v2-tickets section-pad">
        <div className="section-label">02 / БИЛЕТЫ</div>
        <div className="event-v2-section-head">
          <h2>ТЫ<br />ВНУТРИ?</h2>
          <p>Выбирай формат. Остальное сделаем мы.</p>
        </div>

        <div className="ticket-grid">
          {tickets.map((ticket, index) => (
            <article className={`ticket-card ${ticket.hot ? "ticket-card-hot" : ""}`} key={ticket.name}>
              <div className="ticket-card-top">
                <span>0{index + 1}</span>
                {ticket.hot && <b>ГОРЯЧИЕ БИЛЕТЫ</b>}
              </div>
              <h3>{ticket.name}</h3>
              <p>{ticket.note}</p>
              <div className="ticket-card-bottom">
                <strong>{ticket.price}</strong>
                <button type="button">Выбрать ↗</button>
              </div>
            </article>
          ))}
        </div>
        <p className="ticket-disclaimer">Оплата и автоматическая выдача билета подключаются на следующем этапе.</p>
      </section>

      <section className="event-v2-map section-pad">
        <div className="section-label">03 / СХЕМА ЗАЛА</div>
        <div className="event-v2-section-head">
          <h2>ВЫБЕРИ<br />СВОЁ МЕСТО.</h2>
          <p>Схема подготовлена так, чтобы ты сразу понимал, где окажешься во время события.</p>
        </div>

        <div className="hall-plan">
          <div className="hall-stage">AGAYO STAGE</div>
          <div className="hall-zone hall-zone-a"><span>A</span><small>PREMIUM</small></div>
          <div className="hall-zone hall-zone-b"><span>B</span><small>STANDARD</small></div>
          <div className="hall-zone hall-zone-c"><span>C</span><small>STANDARD</small></div>
          <div className="hall-zone hall-zone-vip"><span>VIP</span><small>VIP ZONE</small></div>
          <div className="hall-entry">ВХОД</div>
        </div>

        <div className="hall-legend">
          <span><i className="legend-dot legend-standard" /> Standard</span>
          <span><i className="legend-dot legend-premium" /> Premium</span>
          <span><i className="legend-dot legend-vip" /> VIP</span>
        </div>
      </section>

      <section className="event-v2-program section-pad">
        <div className="section-label">04 / ПРОГРАММА</div>
        <div className="program-list">
          {program.map(([time, title]) => (
            <div className="program-row" key={time}>
              <span>{time}</span>
              <strong>{title}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="event-v2-venue">
        <div className="event-v2-venue-image">
          <Image
            src="https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1800&q=85"
            alt="Место проведения AGAYO NIGHT"
            fill
            sizes="(max-width: 900px) 100vw, 55vw"
          />
        </div>
        <div className="event-v2-venue-copy">
          <div className="section-label">05 / МЕСТО</div>
          <h2>ТЫ БУДЕШЬ<br />ЗДЕСЬ.</h2>
          <p>Точная информация о площадке, входе и важных деталях появится здесь перед мероприятием.</p>
          <Link href="/events" className="button-link">Другие мероприятия <span>↗</span></Link>
        </div>
      </section>

      <section className="event-v2-final section-pad">
        <div className="section-label">AGAYO NIGHT · 29.08.26</div>
        <h2>УВИДИМСЯ<br />ВНУТРИ.</h2>
        <Link href="#tickets" className="button-link button-link-accent">Выбрать билет <span>↗</span></Link>
      </section>
    </main>
  );
}
