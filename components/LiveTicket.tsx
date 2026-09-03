import Link from "next/link";
import type { CSSProperties } from "react";
import { getEvent } from "@/lib/events";

export type LiveTicketData = {
  publicId: string;
  qrDataUrl: string;
  status: "valid" | "used" | "refunded" | "cancelled";
  ownerName: string;
  categoryName: string;
  zone?: string | null;
  seat?: string | null;
  eventSlug: string;
};

const labels = { valid: "ДЕЙСТВИТЕЛЕН", used: "ИСПОЛЬЗОВАН", refunded: "ВОЗВРАЩЁН", cancelled: "ОТМЕНЁН" } as const;

export default function LiveTicket({ ticket }: { ticket: LiveTicketData }) {
  const event = getEvent(ticket.eventSlug);
  if (!event) return null;
  const theme = event.ticketTheme ?? { primary: "#111111", secondary: "#4b0f19", accent: "#c21f39" };
  const style = { "--ticket-primary": theme.primary, "--ticket-secondary": theme.secondary, "--ticket-accent": theme.accent } as CSSProperties;
  const isUsed = ticket.status === "used";
  const poster = event.posterImage ?? event.heroImage;

  return <article className={`digital-ticket poster-driven-ticket status-${ticket.status} ${isUsed ? "is-memory" : ""}`} style={style}>
    <div className="digital-ticket-art" aria-hidden="true"><img src={poster} alt="" /></div>
    <div className="digital-ticket-topline"><span>AGAYO / DIGITAL TICKET</span><strong>{labels[ticket.status]}</strong></div>
    {isUsed ? <div className="ticket-memory-panel"><p>{event.dateLabel} · {event.city.toUpperCase()}</p><h1>ТЫ БЫЛ<br />ЗДЕСЬ</h1><span>Проход уже зафиксирован. Теперь билет остаётся частью твоей истории AGAYO.</span><Link href="/gallery">Открыть фотографии события <b>↗</b></Link></div> : <>
      <div className="ticket-main-grid">
        <div className="ticket-event-copy"><span className="ticket-overline">{event.ageLabel} · {event.alcoholFree ? "ALCOHOL FREE" : "AGAYO"}</span><div className="ticket-poster-polaroid" aria-hidden="true"><img src={poster} alt="" /><span>AGAYO / {event.dateLabel}</span></div><h1>{event.title}</h1><p>{event.dateLabel}<br />{event.timeLabel}<br />{event.city}</p></div>
        <div className={`ticket-qr-wrap ${ticket.status !== "valid" ? "is-disabled" : ""}`}><img className="live-ticket-qr" src={ticket.qrDataUrl} alt="QR-код билета" /><p>{ticket.status === "valid" ? "ОДИН БИЛЕТ = ОДИН ВХОД" : "QR НЕДЕЙСТВИТЕЛЕН"}</p></div>
      </div>
      <div className="ticket-data-grid"><div><span>ВЛАДЕЛЕЦ</span><strong>{ticket.ownerName}</strong></div><div><span>КАТЕГОРИЯ</span><strong>{ticket.categoryName}</strong></div><div><span>ЗОНА</span><strong>{ticket.zone ?? "—"}</strong></div><div><span>МЕСТО</span><strong>{ticket.seat ?? "—"}</strong></div></div>
    </>}
    <div className="digital-ticket-footer"><span>ID</span><strong>{ticket.publicId}</strong><p>{ticket.status === "valid" ? "Покажи QR контролёру на входе" : ticket.status === "refunded" ? "Билет возвращён и не даёт права прохода" : ticket.status === "cancelled" ? "Билет отменён организатором" : "Проход уже зафиксирован"}</p></div>
  </article>;
}
