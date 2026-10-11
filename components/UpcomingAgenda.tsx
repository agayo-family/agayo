'use client';
import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatPrice, getEventCatalogBadge, type AgayoEvent } from '@/lib/events';
import { eventPalette, isHalloweenEvent } from '@/lib/event-presentation';
type AgendaEvent = Pick<AgayoEvent, 'slug' | 'title' | 'startsAt' | 'endsAt' | 'dateLabel' | 'timeLabel' | 'ageLabel' | 'venue' | 'city' | 'posterImage' | 'heroImage' | 'salesState' | 'ticketTheme'> & { tickets: { price: number }[] };
export default function UpcomingAgenda({ events }: { events: AgendaEvent[] }) {
  const [index, setIndex] = useState(0);
  if (!events.length) return null;
  const currentIndex = Math.min(index, events.length - 1);
  const active = events[currentIndex];
  const theme = eventPalette(active.ticketTheme);
  return <section id="upcoming-events" className="landing-agenda section-pad" aria-labelledby="landing-agenda-title" style={{ '--agenda-primary': theme.primary, '--agenda-secondary': theme.secondary, '--agenda-accent': theme.accent } as CSSProperties}>
    <div className="section-label">02 / АФИША</div>
    <div className="landing-section-heading"><h2 id="landing-agenda-title">ТВОЙ<br />СЛЕДУЮЩИЙ ВЕЧЕР.</h2><Link className="text-link" href="/events">Вся афиша и архив ↗</Link></div>
    {events.length > 1 && <div className="agenda-controls"><span aria-live="polite">{currentIndex + 1} / {events.length} · {active.dateLabel}</span><div><button type="button" aria-label="Предыдущее мероприятие" disabled={currentIndex === 0} onClick={() => setIndex(currentIndex - 1)}>←</button><button type="button" aria-label="Следующее мероприятие" disabled={currentIndex >= events.length - 1} onClick={() => setIndex(currentIndex + 1)}>→</button></div></div>}
    <div className="landing-agenda-grid is-single">{events.map((event, position) => {
      const href = `/events/${encodeURIComponent(event.slug)}`;
      const salesOpen = getEventCatalogBadge(event) === 'tickets' && event.tickets.length > 0;
      const prices = event.tickets.map(ticket => ticket.price).filter(price => Number.isFinite(price) && price >= 0);
      const halloween = isHalloweenEvent(event);
      return <article className="landing-agenda-card" key={event.slug} hidden={position !== currentIndex} aria-label={event.title}>
        <Link href={href} className="landing-agenda-cover" aria-label={`Подробнее: ${event.title}`}><Image src={event.posterImage || event.heroImage} alt={`Афиша ${event.title}`} fill sizes="(max-width: 600px) 90vw, 40vw" /><span>{event.ageLabel}</span></Link>
        <div className="landing-agenda-card-content"><div className="landing-agenda-date"><time dateTime={event.startsAt}>{event.dateLabel}</time><span>{event.timeLabel}</span></div><h3><Link href={href}>{event.title}</Link></h3><p className="landing-agenda-place">{event.venue || event.city}{event.venue && <span>{event.city}</span>}</p><div className="landing-agenda-status"><i className={salesOpen ? 'is-open' : ''} aria-hidden="true" />{salesOpen ? 'Билеты в продаже' : event.salesState === 'coming-soon' ? 'Билеты скоро' : 'Продажа закрыта'}</div><Link className="button-link" data-halloween-sound={halloween ? 'true' : undefined} href={`${href}${salesOpen && !halloween ? '#tickets' : ''}`}>{halloween ? 'Войти в Halloween · со звуком' : salesOpen ? prices.length ? `Билеты от ${formatPrice(Math.min(...prices))}` : 'Выбрать билеты' : 'Подробнее о событии'}<span aria-hidden="true">↗</span></Link></div>
      </article>;
    })}</div>
    <p className="agenda-nearest-note">Первым показан ближайший вечер. {events.length > 1 ? 'Перелистни афишу, чтобы выбрать другую дату.' : 'Подробности и категории билетов — на странице события.'}</p>
  </section>;
}
