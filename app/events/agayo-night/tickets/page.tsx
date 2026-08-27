import Link from "next/link";

export default function TicketsPage() {
  return (
    <main className="inner-page">
      <header className="inner-header"><Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link><Link href="/events/agayo-night" className="header-action">Событие</Link></header>
      <div className="inner-wrap ticket-placeholder">
        <div className="section-label">БИЛЕТЫ · AGAYO NIGHT</div>
        <h1 className="inner-title">ТЫ<br />ВНУТРИ?</h1>
        <p className="inner-lead">Покупка билетов подключим следующим этапом. Сейчас здесь уже подготовлено отдельное место для будущей системы оплаты.</p>
        <Link className="button-link button-link-accent" href="/events/agayo-night">Вернуться к событию <span>↗</span></Link>
      </div>
    </main>
  );
}
