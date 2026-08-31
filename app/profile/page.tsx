import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import FavoriteSummary from "@/components/FavoriteSummary";

export default function ProfilePage() {
  return (
    <main className="inner-page">
      <SiteHeader />
      <div className="inner-wrap profile-page">
        <div className="section-label">03 / ПРОФИЛЬ</div>
        <h1 className="inner-title">ТВОЙ<br />AGAYO</h1>
        <p className="inner-lead">Сейчас это интерфейс прототипа. Реальные билеты, история и уровень будут привязаны к Email-аккаунту после подключения backend.</p>
        <div className="profile-grid">
          <div className="profile-card"><span>БИЛЕТЫ</span><strong>—</strong><small>Появятся после авторизации и покупки</small></div>
          <Link href="/profile/favorites" className="profile-card"><span>ИЗБРАННОЕ</span><FavoriteSummary /><small>Твои фотографии ↗</small></Link>
          <div className="profile-card"><span>УРОВЕНЬ</span><strong>СВОЙ</strong><small>Название уровня будет редактироваться владельцем</small></div>
          <div className="profile-card"><span>ПОСЕЩЕНИЯ</span><strong>—</strong><small>Будут считаться по фактическим проходам</small></div>
        </div>
      </div>
    </main>
  );
}
