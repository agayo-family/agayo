import Link from "next/link";

export default function ProfilePage() {
  return (
    <main className="inner-page">
      <header className="inner-header">
        <Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link>
        <Link href="/events" className="header-action">Мероприятия</Link>
      </header>
      <div className="inner-wrap profile-page">
        <div className="section-label">04 / ПРОФИЛЬ</div>
        <h1 className="inner-title">ТВОЙ<br />AGAYO.</h1>
        <div className="profile-grid">
          <Link href="/events/agayo-night" className="profile-card"><span>БИЛЕТЫ</span><strong>1</strong><small>Ближайшее событие ↗</small></Link>
          <Link href="/gallery" className="profile-card"><span>ИЗБРАННОЕ</span><strong>♡</strong><small>Твои фотографии ↗</small></Link>
          <div className="profile-card"><span>УРОВЕНЬ</span><strong>СВОЙ</strong><small>Твоя история только начинается</small></div>
          <div className="profile-card"><span>ПОСЕЩЕНИЯ</span><strong>0</strong><small>Будем исправлять ↗</small></div>
        </div>
      </div>
    </main>
  );
}
