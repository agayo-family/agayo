"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="agayo-error-page"><span className="section-label">AGAYO / ПАУЗА</span><h1>ПОПРОБУЕМ<br />ЕЩЁ РАЗ?</h1><p>Не удалось загрузить эту страницу. Твои билеты и данные остаются в аккаунте.</p><button type="button" className="button-link button-link-accent" onClick={reset}>Обновить страницу <span>↻</span></button><Link className="text-link" href="/events">К мероприятиям ↗</Link></main>;
}
