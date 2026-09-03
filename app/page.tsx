import Image from "next/image";
import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import SiteHeader from "@/components/SiteHeader";
import VoiceReview from "@/components/VoiceReview";
import { getAllEventsServer, getUpcomingEventServer } from "@/lib/server/events";
import { galleryPhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";
export default async function Home() {
  const events = await getAllEventsServer();
  const upcoming = await getUpcomingEventServer();
  const heroEvent = upcoming ?? events[0];
  const archive = events.filter((event) => event.status === "published" && event.salesState === "closed").slice(0, 2);

  return (
    <main>
      <SiteHeader overlay />
      <section className="hero"><Image src={heroEvent.heroImage} alt="AGAYO" fill priority sizes="100vw" className="hero-image" /><div className="hero-shade" /><div className="hero-content"><div className="eyebrow">AGAYO · ЙОШКАР-ОЛА</div><h1>Создавай<br />воспоминания,<br />а не провалы<br />в памяти</h1><div className="hero-bottom"><p>Мероприятия для тех, кто хочет прожить молодость так, чтобы её захотелось вспомнить.</p><Link className="circle-link" href="/events" aria-label="К мероприятиям">↓</Link></div></div></section>

      <section className="intro section-pad"><div className="section-label">01 / СВОИ</div><div className="intro-grid"><h2>МЫ — СВОИ</h2><div className="intro-copy"><p>Мы создаём вечеринки, концерты и клабшоу, на которых весело без алкоголя.</p><p>Обычные подростки, которые хотят делать события, выглядящие не как «обычно».</p><div className="tag-row"><span>14+</span><span>18:00—21:00</span><span>Alcohol Free</span></div></div></div></section>

      <section className="formats section-pad"><div className="section-label">02 / ФОРМАТ</div><div className="format-list"><Link href="/events" className="format-item"><span>01</span><strong>ВЕЧЕРИНКИ</strong><b>↗</b></Link><Link href="/events" className="format-item"><span>02</span><strong>КОНЦЕРТЫ</strong><b>↗</b></Link><Link href="/events" className="format-item"><span>03</span><strong>КЛАБШОУ</strong><b>↗</b></Link></div></section>

      <section className="next-event section-pad"><div className="section-label">03 / СЛЕДУЮЩЕЕ</div>{upcoming ? <div className="event-feature"><div className="event-image-wrap"><Image src={upcoming.heroImage} alt={upcoming.title} fill sizes="(max-width: 900px) 100vw, 55vw" className="event-image" /></div><div className="event-copy"><div className="event-date">{upcoming.dateLabel}</div><h2>{upcoming.title}</h2><p className="event-meta">{upcoming.ageLabel} · {upcoming.timeLabel} · {upcoming.city}</p><p className="event-description">{upcoming.description}</p><Link className="button-link" href={`/events/${upcoming.slug}`}>Посмотреть событие <span>↗</span></Link></div></div> : <div className="empty-next-event"><h2>СКОРО</h2><p>Следующее мероприятие ещё не опубликовано. Как только появится новое событие, этот блок обновится из общей карточки мероприятия.</p><Link className="button-link" href="/events">Архив мероприятий <span>↗</span></Link></div>}</section>

      <section className="statement section-pad"><div className="statement-mark">AGAYO</div><h2>ОДНАЖДЫ ТЫ БУДЕШЬ ВСПОМИНАТЬ ЭТО ВРЕМЯ</h2><p>Мы хотим, чтобы тебе было что вспомнить.</p></section>

      <section className="archive section-pad"><div className="section-label">04 / ТЕ САМЫЕ ВЕЧЕРА</div><div className="archive-grid">{archive.map((event, index) => { const photo = galleryPhotos.find((item) => item.eventSlug === event.slug); return <article className={index === 0 ? "archive-card archive-card-large" : "archive-card"} key={event.slug}><div className="archive-image-wrap"><Link href={`/events/${event.slug}`} className="card-image-link" aria-label={`Открыть ${event.title}`}><Image src={event.heroImage} alt={event.title} fill sizes="(max-width: 900px) 100vw, 50vw" className="archive-image" /></Link>{photo && <FavoriteButton photoId={photo.id} />}</div><Link href={`/events/${event.slug}`} className="archive-meta"><span>{event.dateLabel}</span><strong>{event.title}</strong><span>{event.ageLabel} · {event.timeLabel}</span></Link></article>; })}</div><Link className="text-link" href="/gallery">Смотреть все фотографии <span>↗</span></Link></section>

      <section className="voices section-pad"><div className="section-label">05 / ГОЛОСА</div><VoiceReview text="Я вообще не хотела идти. Хорошо, что друзья заставили." author="Алина, 16" /></section>
      <section className="final-cta section-pad"><div className="section-label">06 / ДО ВСТРЕЧИ</div><h2>МОЛОДОСТЬ НЕ ПОВТОРИТСЯ</h2><p>Следующее событие появится в разделе мероприятий.</p><Link className="button-link button-link-accent" href="/events">Посмотреть мероприятия <span>↗</span></Link></section>
      <footer className="footer"><div><div className="footer-brand">AGAYO<span className="brand-dot">.</span></div><p>Проживи так, чтобы вспомнить.</p><p>ИП Ергин Сергей Валентинович · ИНН 121524098311</p></div><div className="footer-links"><Link href="/events">Мероприятия</Link><Link href="/gallery">Галерея</Link><Link href="/profile">Профиль</Link><Link href="/legal">Правовая информация</Link></div><div className="footer-bottom"><span>Telegram · VK</span><span>© AGAYO 2023</span></div></footer>
    </main>
  );
}
