import Link from "next/link";
import type { CSSProperties } from "react";
import SiteHeader from "@/components/SiteHeader";
import FavoriteSummary from "@/components/FavoriteSummary";
import ProfileFavoritesPreview from "@/components/ProfileFavoritesPreview";
import ProfileEditor from "@/components/ProfileEditor";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getAllEventsServer } from "@/lib/server/events";
import { getLoyaltyLevels } from "@/lib/server/loyalty";
import HalloweenArt from '@/components/HalloweenArt';
import { eventPalette, isHalloweenEvent } from '@/lib/event-presentation';
import { personalTicketDescriptions } from '@/lib/server/personal-ticket-store';
import { readProfileTicketPage } from '@/lib/server/profile-ticket-store';

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  valid:"ДЕЙСТВИТЕЛЕН",
  used:"ИСПОЛЬЗОВАН",
  refunded:"ВОЗВРАЩЁН",
  cancelled:"ОТМЕНЁН",
};

function eventTicketStyle(event:any):CSSProperties {
  const theme=eventPalette(event?.ticketTheme);
  return {
    '--profile-ticket-primary':String(theme.primary||'#151517'),
    '--profile-ticket-secondary':String(theme.secondary||'#4B0F19'),
    '--profile-ticket-accent':String(theme.accent||'#C21F39'),
  } as CSSProperties;
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ page?: string; activePage?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.page);
  const page = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1;
  const activeParsed = Number(params.activePage);
  const activePage = Number.isInteger(activeParsed) && activeParsed > 0 ? Math.min(activeParsed, 10000) : 1;
  let user: any = null;
  let tickets: any[] = [];
  let totalTickets = 0, visits = 0, activeTotal = 0;
  let activeTickets: any[] = [], usedTickets: any[] = [];
  let personal = new Map<string, { title: string; description: string }>();
  if (process.env.DATABASE_URL) {
    try {
      user = await getCurrentUser();
      if (user) {
        const sql = db();
        const result = await readProfileTicketPage(sql, user.id, page, activePage);
        tickets = result.history; activeTickets = result.active; usedTickets = result.memories;
        totalTickets = result.total; visits = result.visits; activeTotal = result.activeTotal;
        personal = await personalTicketDescriptions(sql, [...tickets,...activeTickets,...usedTickets].map(ticket => String(ticket.public_id)));
      }
    } catch (error) { console.error(error); }
  }

  const [events,loyaltyLevels] = await Promise.all([getAllEventsServer(),getLoyaltyLevels()]);
  const eventMap = new Map(events.map((event) => [event.slug,event]));
  const currentLevelKey = String(user?.loyalty_level || "NEW");
  const currentLevel = loyaltyLevels.find((level) => level.levelKey === currentLevelKey) ?? loyaltyLevels[0];
  const currentLevelIndex = Math.max(0,loyaltyLevels.findIndex((level) => level.levelKey === currentLevelKey));
  const manualLevel = Boolean(user?.loyalty_override_level);

  return (
    <main id="main-content" className="inner-page profile-page-v2">
      <SiteHeader />
      <div className="profile-shell">
        <section className="profile-identity">
          <div className="profile-identity-copy">
            <div className="section-label">03 / ПРОФИЛЬ</div>
            <p className="profile-kicker">ТВОЙ ЦИФРОВОЙ ПРОПУСК В AGAYO</p>
            <h1>AGAYO<br />ID</h1>
            <p className="profile-id-note">{user ? `${user.display_name || user.email || user.phone} · профиль активен` : "Войди по одноразовому коду — без пароля. После первой покупки профиль также создаётся автоматически по email."}</p>
          </div>

          <div className={`agayo-id-card agayo-id-level-v134 ${currentLevel?.visualMode === "image" && currentLevel.visualImageUrl ? "has-level-image" : ""}`} aria-label="AGAYO ID" style={{
            '--id-primary':currentLevel?.visualPrimary || '#151517',
            '--id-secondary':currentLevel?.visualSecondary || '#4B0F19',
            '--id-accent':currentLevel?.visualAccent || '#C21F39',
          } as CSSProperties}>
            {currentLevel?.visualMode === "image" && currentLevel.visualImageUrl ? <div className="agayo-id-level-image-v134" aria-hidden="true" style={{backgroundImage:`linear-gradient(180deg,rgba(8,8,9,.08),rgba(8,8,9,.62)),url("${String(currentLevel.visualImageUrl).replace(/["\\]/g,'')}")`}} /> : null}
            <div className="agayo-id-top"><span>AGAYO ID</span><span>14+</span></div>
            <div className="agayo-id-mark">A</div>
            <div className="agayo-id-bottom">
              <div><span>УРОВЕНЬ</span><strong>{currentLevel?.displayName || "NEW"}</strong></div>
              <div><span>ПОСЕЩЕНИЯ</span><strong>{String(visits).padStart(2,"0")}</strong></div>
              <div><span>ID</span><strong>{user?.agayo_id || "—"}</strong></div>
            </div>
          </div>
        </section>

        <section id="active-tickets" className="profile-section profile-tickets-section">
          <div className="profile-section-head">
            <div><div className="section-label">01 / БИЛЕТЫ</div><h2>АКТИВНЫЕ</h2></div>
            <span className="profile-count">{activeTotal}</span>
          </div>
          {activeTickets.length ? <div className="profile-live-tickets">{activeTickets.map((ticket) => { const event=eventMap.get(String(ticket.event_slug)), invitation=personal.get(String(ticket.public_id)); return <Link className="profile-live-ticket profile-event-ticket-v134" style={eventTicketStyle(event)} href={`/tickets/${ticket.qr_token}`} key={ticket.public_id}>{event && isHalloweenEvent(event) ? <HalloweenArt compact /> : null}<span>{event?.dateLabel || "AGAYO"}</span><strong>{event?.title || ticket.event_slug}</strong><p>{ticket.category_name} · {ticket.public_id}</p>{invitation ? <div className="profile-personal-message"><b>{invitation.title}</b><p>{invitation.description}</p></div> : null}<b>ОТКРЫТЬ БИЛЕТ ↗</b></Link>; })}</div> : <div className="profile-empty profile-ticket-empty"><div className="profile-empty-number">00</div><div><span>{activePage > 1 ? 'НА ЭТОЙ СТРАНИЦЕ НЕТ АКТИВНЫХ БИЛЕТОВ' : 'АКТИВНЫХ БИЛЕТОВ НЕТ'}</span><p>{user ? "После покупки билет появится здесь автоматически." : "Войди в AGAYO ID или купи первый билет — профиль создастся автоматически."}</p><div className="profile-ticket-actions"><Link href="/events" className="button-link">Найти событие <b>↗</b></Link></div></div></div>}
          {activeTotal > 50 || activePage > 1 ? <nav className="profile-ticket-pagination" aria-label="Страницы активных билетов">{activePage > 1 ? <Link href={`/profile?page=${page}&activePage=${activePage - 1}#active-tickets`}>← Предыдущие</Link> : null}<span>Активных билетов: {activeTotal} · страница {activePage}</span>{activePage * 50 < activeTotal ? <Link href={`/profile?page=${page}&activePage=${activePage + 1}#active-tickets`}>Следующие →</Link> : null}</nav> : null}
        </section>

        <section className="profile-section profile-memories-section">
          <div className="profile-section-head">
            <div><div className="section-label">02 / ИСТОРИЯ</div><h2>ТЫ БЫЛ<br />ЗДЕСЬ</h2></div>
            <span className="profile-count">{visits}</span>
          </div>
          {usedTickets.length ? <div className="profile-live-tickets">{usedTickets.slice(0,6).map((ticket) => { const event=eventMap.get(String(ticket.event_slug)); return <Link className="profile-live-ticket profile-event-ticket-v134" style={eventTicketStyle(event)} href={`/tickets/${ticket.qr_token}`} key={ticket.public_id}>{event && isHalloweenEvent(event) ? <HalloweenArt compact /> : null}<span>{event?.dateLabel || "AGAYO"}</span><strong>{event?.title || ticket.event_slug}</strong><p>{ticket.category_name} · проход зафиксирован</p><b>ОТКРЫТЬ ВОСПОМИНАНИЕ ↗</b></Link>; })}</div> : <div className="profile-memory-empty"><p>После первого использованного билета событие появится здесь как часть твоей истории AGAYO.</p><span>ПОКА ТИШИНА</span></div>}
        </section>

        <section className="profile-section profile-loyalty-section">
          <div className="profile-section-head profile-section-head-light">
            <div><div className="section-label">03 / СВОИ</div><h2>ТВОЙ<br />УРОВЕНЬ</h2></div>
            <strong className="profile-current-level">{currentLevel?.displayName || "NEW"}</strong>
          </div>
          <div className="loyalty-track" aria-label="Уровни лояльности">
            {loyaltyLevels.map((level,index) => (
              <div className={`loyalty-step ${index === currentLevelIndex ? "is-current" : ""}`} key={level.levelKey}>
                <span>{String(index + 1).padStart(2,"0")}</span><strong>{level.displayName}</strong>
              </div>
            ))}
          </div>
          <div className="loyalty-copy-grid">
            <p>{currentLevel?.conditionsText || 'Условия уровня определяет команда AGAYO.'}</p>
            <div className="loyalty-perks"><span>{manualLevel ? 'ОСОБЫЙ СТАТУС' : currentLevel?.autoByVisits ? 'ТЕКУЩИЙ ПРОГРЕСС' : 'УСЛОВИЯ УРОВНЯ'}</span><p>{manualLevel ? `Этот уровень назначен командой AGAYO независимо от количества посещений · посещений: ${visits}` : currentLevel?.autoByVisits ? `${visits} посещений · автоматический уровень обновляется после прохода по билету` : 'Этот уровень выдаётся по условиям, которые определяет команда AGAYO.'}</p></div>
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

        <section id="ticket-history" className="profile-section profile-history-section">
          <div className="profile-section-head"><div><div className="section-label">05 / АРХИВ</div><h2>ИСТОРИЯ<br />БИЛЕТОВ</h2></div></div>
          <div className="ticket-history-head"><span>СОБЫТИЕ</span><span>СТАТУС</span><span>БИЛЕТ</span></div>
          {tickets.length ? tickets.map((ticket) => { const event=eventMap.get(String(ticket.event_slug)); return <Link href={`/tickets/${ticket.qr_token}`} className="ticket-history-empty profile-history-ticket-v134" style={eventTicketStyle(event)} key={ticket.public_id}>{event && isHalloweenEvent(event) ? <HalloweenArt compact /> : null}<span>{event?.title || ticket.event_slug}{personal.has(String(ticket.public_id)) ? <small>{personal.get(String(ticket.public_id))?.title}</small> : null}</span><b>{statusLabels[String(ticket.status)] || String(ticket.status).toUpperCase()}</b><b>{ticket.public_id}</b></Link>; }) : <div className="ticket-history-empty"><span>История появится после первой покупки</span><b>—</b><b>—</b></div>}
          {totalTickets > 50 || page > 1 ? <nav className="profile-ticket-pagination" aria-label="Страницы билетов">{page > 1 ? <Link href={`/profile?page=${page - 1}&activePage=${activePage}#ticket-history`}>← Предыдущие</Link> : null}<span>Страница {page} · всего {totalTickets} билетов</span>{page * 50 < totalTickets ? <Link href={`/profile?page=${page + 1}&activePage=${activePage}#ticket-history`}>Следующие →</Link> : null}</nav> : null}
        </section>

        <section className="profile-section profile-settings-section">
          <div className="profile-section-head"><div><div className="section-label">06 / АККАУНТ</div><h2>НАСТРОЙКИ</h2></div></div>
          {user ? <ProfileEditor firstName={String(user.first_name || "")} lastName={String(user.last_name || "")} /> : null}
          <div className="profile-settings-list">
            <Link href="/auth" className="profile-setting-row"><span>EMAIL / ТЕЛЕФОН</span><strong>{user ? "ВХОД АКТИВЕН" : "ВОЙТИ ПО КОДУ"}</strong><b>→</b></Link>
            <div className="profile-setting-row"><span>ДОСТАВКА БИЛЕТОВ</span><strong>EMAIL</strong><b>✓</b></div>
            {user ? <LogoutButton /> : <Link href="/auth" className="profile-setting-row profile-logout"><span>АККАУНТ</span><strong>ВОЙТИ</strong><b>→</b></Link>}
          </div>
          <p className="profile-backend-note">AGAYO ID, профиль, избранные фото, покупки, билеты, QR и история работают из серверной базы и доступны после входа на любом устройстве.</p>
        </section>
      </div>
    </main>
  );
}
