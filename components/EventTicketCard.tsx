"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatPrice, type TicketCategory } from "@/lib/events";

export default function EventTicketCard({ ticket, index, eventSlug, salesOpen, hotBatchRemaining }: {
  ticket: TicketCategory;
  index: number;
  eventSlug: string;
  salesOpen: boolean;
  hotBatchRemaining?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const contentId = useId();
  const hot = Boolean(ticket.hotTickets?.enabled && salesOpen && !ticket.soldOut && Number.isInteger(hotBatchRemaining) && hotBatchRemaining! > 0 && hotBatchRemaining! <= 5);

  return <article
    className={`ticket-card ticket-tone-${index % 3}${hot ? " ticket-card-hot-batch" : ""}${revealed ? " is-hot-revealed" : ""}`}
    onPointerEnter={event => { if (event.pointerType === "mouse") setRevealed(true); }}
  >
    {hot && <button
      type="button"
      className="ticket-hot-curtain"
      aria-label={`Показать горячую категорию «${ticket.name}»`}
      aria-expanded={revealed}
      aria-controls={contentId}
      tabIndex={revealed ? -1 : 0}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setRevealed(true); }}
      onClick={() => setRevealed(true)}
    >
      <svg viewBox="0 0 180 220" aria-hidden="true" focusable="false"><path d="M94 8c8 40 50 54 39 91 15-9 21-24 20-38 24 29 35 54 23 90-13 40-44 61-83 61-45 0-79-30-79-70 0-29 15-53 39-75-3 25 1 43 15 53C53 77 83 55 94 8Z" fill="currentColor" /><path d="M98 105c-1 29 21 37 21 61 0 19-13 33-31 33-21 0-35-16-35-34 0-18 11-35 24-47-3 18-1 29 7 36-3-19 8-33 14-49Z" fill="#b80e29" /></svg>
      <span>ГОРЯЧАЯ ПАРТИЯ</span>
      <small>Открыть категорию ↗</small>
    </button>}
    <div className="ticket-card-content" id={contentId}>
      <div className="ticket-card-top"><span>{String(index + 1).padStart(2, "0")}</span>{hot && <b>ГОРЯЧИЕ БИЛЕТЫ</b>}</div>
      <h3>{ticket.name}</h3><p>{ticket.note}</p>
      {hot && <div className="ticket-hot-remaining"><span>В текущей горячей партии осталось</span><strong>{hotBatchRemaining} <small>{hotBatchRemaining === 1 ? "билет" : hotBatchRemaining! < 5 ? "билета" : "билетов"}</small></strong><p>После продажи партии откроется следующая, если билеты ещё доступны.</p></div>}
      <div className="ticket-card-bottom"><strong>{formatPrice(ticket.price)}</strong>{salesOpen && !ticket.soldOut ? <Link className="ticket-select" href={`/events/${encodeURIComponent(eventSlug)}/checkout?category=${encodeURIComponent(ticket.id)}`} prefetch={false}>Выбрать ↗</Link> : <span className="ticket-closed">{ticket.soldOut ? "SOLD OUT" : "Закрыто"}</span>}</div>
    </div>
  </article>;
}
