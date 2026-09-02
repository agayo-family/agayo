import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import FavoriteSummary from "@/components/FavoriteSummary";
import ProfileFavoritesPreview from "@/components/ProfileFavoritesPreview";

const loyaltyLevels = ["NEW", "INSIDE", "REGULAR", "GOLD", "LEGEND"];

export default function ProfilePage() {
  return (
    <main className="inner-page profile-page-v2">
      <SiteHeader />

      <div className="profile-shell">
        <section className="profile-identity">
          <div className="profile-identity-copy">
            <div className="section-label">03 / ПРОФИЛЬ</div>
            <p className="profile-kicker">ТВОЙ ЦИФРОВОЙ ПРОПУСК В AGAYO</p>
            <h1>AGAYO<br />ID</h1>
            <p className="profile-id-note">После входа по Email здесь появятся твоё имя, персональный ID и реальные данные аккаунта.</p>
          </div>

          <div className="agayo-id-card" aria-label="AGAYO ID">
            <div className="agayo-id-top"><span>AGAYO ID</span><span>14+</span></div>
            <div className="agayo-id-mark">A</div>
            <div className="agayo-id-bottom">
              <div><span>УРОВЕНЬ</span><strong>NEW</strong></div>
              <div><span>ПОСЕЩЕНИЯ</span><strong>00</strong></div>
              <div><span>ID</span><strong>—</strong></div>
            </div>
          </div>
        </section>

        <section className="profile-section profile-tickets-section">
          <div className="profile-section-head">
            <div><div className="section-label">01 / БИЛЕТЫ</div><h2>БЛИЖАЙШИЕ</h2></div>
            <span className="profile-count">0</span>
          </div>
          <div className="profile-empty profile-ticket-empty">
            <div className="profile-empty-number">00</div>
            <div><span>АКТИВНЫХ БИЛЕТОВ НЕТ</span><p>Когда ты купишь билет, он появится здесь вместе с QR-кодом, категорией и датой события.</p><div className="profile-ticket-actions"><Link href="/events" className="button-link">Найти событие <b>↗</b></Link><Link href="/tickets/demo-vernite-lampovost" className="profile-demo-link">Посмотреть демо билета</Link></div></div>
          </div>
        </section>

        <section className="profile-section profile-memories-section">
          <div className="profile-section-head">
            <div><div className="section-label">02 / ИСТОРИЯ</div><h2>ТЫ БЫЛ<br />ЗДЕСЬ</h2></div>
            <span className="profile-count">0</span>
          </div>
          <div className="profile-memory-empty">
            <p>После первого использованного билета событие превратится здесь из QR-кода в воспоминание — с датой, фотографиями и переходом в его архив.</p>
            <span>ПОКА ТИШИНА</span>
          </div>
        </section>

        <section className="profile-section profile-loyalty-section">
          <div className="profile-section-head profile-section-head-light">
            <div><div className="section-label">03 / СВОИ</div><h2>ТВОЙ<br />УРОВЕНЬ</h2></div>
            <strong className="profile-current-level">NEW</strong>
          </div>

          <div className="loyalty-track" aria-label="Уровни лояльности">
            {loyaltyLevels.map((level, index) => (
              <div className={`loyalty-step ${index === 0 ? "is-current" : ""}`} key={level}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{level}</strong>
              </div>
            ))}
          </div>

          <div className="loyalty-copy-grid">
            <p>Уровень растёт вместе с реальными посещениями. Названия, условия и привилегии позже будут полностью управляться владельцем через служебную часть.</p>
            <div className="loyalty-perks"><span>В ПЕРСПЕКТИВЕ</span><p>Ранний доступ · закрытые события · специальные предложения · мерч · приглашения</p></div>
          </div>
        </section>

        <section className="profile-section profile-favorites-section">
          <div className="profile-section-head">
            <div><div className="section-label">04 / КАДРЫ</div><h2>ИЗБРАННЫЕ<br />ФОТО</h2></div>
            <Link href="/profile/favorites" className="profile-count profile-count-link" aria-label="Открыть избранное"><FavoriteSummary /></Link>
          </div>
          <ProfileFavoritesPreview />
          <Link className="text-link" href="/profile/favorites">Смотреть все избранные <span>↗</span></Link>
        </section>

        <section className="profile-section profile-history-section">
          <div className="profile-section-head">
            <div><div className="section-label">05 / АРХИВ</div><h2>ИСТОРИЯ<br />БИЛЕТОВ</h2></div>
          </div>
          <div className="ticket-history-head"><span>СОБЫТИЕ</span><span>СТАТУС</span><span>БИЛЕТ</span></div>
          <div className="ticket-history-empty"><span>История появится после первой покупки</span><b>—</b><b>—</b></div>
        </section>

        <section className="profile-section profile-settings-section">
          <div className="profile-section-head">
            <div><div className="section-label">06 / АККАУНТ</div><h2>НАСТРОЙКИ</h2></div>
          </div>
          <div className="profile-settings-list">
            <div className="profile-setting-row"><span>EMAIL</span><strong>НЕ ПОДКЛЮЧЁН</strong><b>→</b></div>
            <div className="profile-setting-row"><span>TELEGRAM</span><strong>ПОЗЖЕ</strong><b>→</b></div>
            <div className="profile-setting-row"><span>УВЕДОМЛЕНИЯ</span><strong>ПОСЛЕ АВТОРИЗАЦИИ</strong><b>→</b></div>
          </div>
          <p className="profile-backend-note">Сейчас это визуальная версия профиля. Авторизация по Email-коду, реальные билеты, QR, история посещений и уведомления подключаются на backend-этапе.</p>
        </section>
      </div>
    </main>
  );
}
