"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import DemoQr from "@/components/DemoQr";
import { demoTicket, ticketStatusLabels, type TicketStatus } from "@/lib/tickets";
import { getEvent } from "@/lib/events";

const statuses: TicketStatus[] = ["valid", "used", "refunded", "cancelled"];

export default function TicketExperience() {
  const [status, setStatus] = useState<TicketStatus>(demoTicket.status);
  const isUsed = status === "used";
  const event = getEvent(demoTicket.eventSlug);
  const poster = event?.posterImage ?? event?.heroImage;
  const theme = event?.ticketTheme ?? { primary: "#0f0f10", secondary: "#4b0f19", accent: "#c21f39" };
  const ticketStyle = {
    "--ticket-primary": theme.primary,
    "--ticket-secondary": theme.secondary,
    "--ticket-accent": theme.accent,
  } as CSSProperties;

  return (
    <>
      <div className="ticket-demo-switch" aria-label="Предпросмотр статусов билета">
        <span>ДЕМО-РЕЖИМ / СТАТУС</span>
        <div>
          {statuses.map((item) => (
            <button key={item} type="button" className={status === item ? "is-active" : ""} onClick={() => setStatus(item)}>
              {ticketStatusLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <article className={`digital-ticket poster-driven-ticket status-${status} ${isUsed ? "is-memory" : ""}`} style={ticketStyle}>
        <div className="digital-ticket-art" aria-hidden="true">
          {poster ? <img src={poster} alt="" /> : null}
        </div>
        <div className="digital-ticket-topline">
          <span>AGAYO / DIGITAL TICKET</span>
          <strong>{ticketStatusLabels[status]}</strong>
        </div>

        {isUsed ? (
          <div className="ticket-memory-panel">
            <p>{demoTicket.eventDate} · {demoTicket.city.toUpperCase()}</p>
            <h1>ТЫ БЫЛ<br />ЗДЕСЬ</h1>
            <span>QR больше не нужен. Теперь это часть твоей истории AGAYO.</span>
            <Link href="/gallery">Открыть фотографии события <b>↗</b></Link>
          </div>
        ) : (
          <>
            <div className="ticket-main-grid">
              <div className="ticket-event-copy">
                <span className="ticket-overline">14+ · ALCOHOL FREE</span>
                {poster ? (
                  <div className="ticket-poster-polaroid" aria-hidden="true">
                    <img src={poster} alt="" />
                    <span>AGAYO / {demoTicket.eventDate}</span>
                  </div>
                ) : null}
                <h1>{demoTicket.eventTitle}</h1>
                <p>{demoTicket.eventDate}<br />{demoTicket.eventTime}<br />{demoTicket.city}</p>
              </div>

              <div className={`ticket-qr-wrap ${status !== "valid" ? "is-disabled" : ""}`}>
                <DemoQr />
                <p>{status === "valid" ? "ОДИН БИЛЕТ = ОДИН ВХОД" : "QR НЕДЕЙСТВИТЕЛЕН"}</p>
              </div>
            </div>

            <div className="ticket-data-grid">
              <div><span>ВЛАДЕЛЕЦ</span><strong>{demoTicket.ownerName}</strong></div>
              <div><span>КАТЕГОРИЯ</span><strong>{demoTicket.category}</strong></div>
              <div><span>ЗОНА</span><strong>{demoTicket.zone ?? "—"}</strong></div>
              <div><span>МЕСТО</span><strong>{demoTicket.seat ?? "—"}</strong></div>
            </div>
          </>
        )}

        <div className="digital-ticket-footer">
          <span>ID</span>
          <strong>{demoTicket.id}</strong>
          <p>{status === "valid" ? "Покажи QR контролёру на входе" : status === "refunded" ? "Билет возвращён и не даёт права прохода" : status === "cancelled" ? "Билет отменён организатором" : "Проход уже зафиксирован"}</p>
        </div>
      </article>

      <p className="ticket-demo-note">Сейчас это визуальный прототип. В рабочей версии статус и QR нельзя будет менять вручную: они будут приходить с сервера после оплаты, возврата или сканирования контролёром.</p>
    </>
  );
}
