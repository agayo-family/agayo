'use client';

import { useEffect, useMemo, useState } from 'react';
import TeamAccessPanel from './TeamAccessPanel';
import AdminEventsManager, { type StoredEvent } from './AdminEventsManager';
import { AdminPermission, AdminRole, ROLE_LABELS } from '@/lib/admin-permissions';

type Tab = 'overview' | 'events' | 'tickets' | 'buyers' | 'promo' | 'media' | 'team' | 'settings';

const tabs: Array<[Tab, string]> = [
  ['overview', 'Обзор'],
  ['events', 'События'],
  ['tickets', 'Билеты'],
  ['buyers', 'Покупатели'],
  ['promo', 'Промокоды'],
  ['media', 'Фото и отзывы'],
  ['team', 'Команда'],
  ['settings', 'Настройки'],
];


export type AdminAccessView = {
  userId: string;
  agayoId: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  allEvents: boolean;
  eventSlugs: string[];
  bootstrapOwner: boolean;
};

const tabPermissions: Record<Tab, AdminPermission[]> = {
  overview: ['view_dashboard'],
  events: ['manage_events', 'publish_events', 'manage_ticket_inventory'],
  tickets: ['scan_tickets', 'manual_ticket_search', 'cancel_tickets', 'refund_tickets', 'issue_comp_tickets'],
  buyers: ['view_buyers', 'manage_loyalty'],
  promo: ['manage_promos'],
  media: ['manage_media'],
  team: ['manage_team'],
  settings: ['manage_system'],
};

type DashboardData = {
  metrics: { revenue: number; sold: number; used: number; refunds: number };
  today: { newOrders: number; newUsers: number; paymentErrors: number };
  upcoming: { slug: string; title: string; starts_at: string; status: string; sales_state: string; age_label: string } | null;
};

type PromoView = { id:string; code:string; event_slug:string|null; discount_type:'fixed'|'percent'; discount_value:number; usage_limit:number|null; used_count:number; expires_at:string|null; is_active:boolean };
type TicketSearchView = { id:string; public_id:string; event_slug:string; owner_name:string; category_name:string; status:string; used_at:string|null; email:string|null; phone:string|null; agayo_id:string|null };
type BuyerView = { id:string; agayo_id:string|null; display_name:string|null; email:string|null; phone:string|null; loyalty_level:string; tickets:number; visits:number };

export default function AdminDashboard({ access, previewMode = false }: { access: AdminAccessView; previewMode?: boolean }) {
  const initialTab = tabs.find(([id]) => access.role === 'owner' || tabPermissions[id].some((permission) => access.permissions.includes(permission)))?.[0] ?? 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ticketMode, setTicketMode] = useState<'zones' | 'seats' | 'free-entry'>('zones');
  const [eventSaving, setEventSaving] = useState(false);
  const [eventMessage, setEventMessage] = useState("");
  const [storedEvents, setStoredEvents] = useState<StoredEvent[]>(previewMode ? [
    { id:'preview-lamp', slug:'vernite-lampovost', title:'ВЕРНИТЕ ЛАМПОВОСТЬ', starts_at:'2026-09-12T17:30:00+03:00', ends_at:'2026-09-12T21:00:00+03:00', status:'published', sales_state:'open', ticket_mode:'general-admission' },
    { id:'preview-night', slug:'agayo-night', title:'AGAYO NIGHT', starts_at:'2026-08-29T18:00:00+03:00', ends_at:'2026-08-29T21:00:00+03:00', status:'published', sales_state:'closed', ticket_mode:'zones' },
  ] : []);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [promos, setPromos] = useState<PromoView[]>([]);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoMessage, setPromoMessage] = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<TicketSearchView[]>([]);
  const [ticketSearching, setTicketSearching] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyers, setBuyers] = useState<BuyerView[]>([]);
  const [buyerSearching, setBuyerSearching] = useState(false);

  useEffect(() => {
    if (previewMode || !can("manage_events")) return;
    fetch("/api/admin/events", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (response.ok) setStoredEvents(data.events || []);
    }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  useEffect(() => {
    if (previewMode || !can('view_dashboard')) return;
    fetch('/api/admin/dashboard', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (response.ok) setDashboard(data);
    }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  useEffect(() => {
    if (previewMode || !can('manage_promos')) return;
    fetch('/api/admin/promos', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (response.ok) setPromos(data.promos || []);
    }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  useEffect(() => {
    if (previewMode || !can('view_buyers')) return;
    void searchBuyers('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  async function createPromo() {
    if (previewMode) { setPromoMessage('Предпросмотр: промокод не записан в базу.'); return; }
    const shell = document.querySelector<HTMLElement>('.admin-promo-editor');
    if (!shell) return;
    const input = (name:string) => (shell.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '').trim();
    setPromoSaving(true); setPromoMessage('');
    try {
      const response = await fetch('/api/admin/promos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
        code:input('promoCode'), discountType:input('promoType'), discountValue:Number(input('promoValue')), usageLimit:input('promoLimit') ? Number(input('promoLimit')) : null, expiresAt:input('promoExpires') || null, eventSlug:input('promoEvent') || null,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось создать промокод');
      setPromos((current) => [data.promo, ...current]);
      setPromoMessage(`Промокод ${data.promo.code} создан`);
      const codeInput = shell.querySelector<HTMLInputElement>('[name="promoCode"]');
      if (codeInput) codeInput.value='';
    } catch (cause) { setPromoMessage(cause instanceof Error ? cause.message : 'Ошибка'); } finally { setPromoSaving(false); }
  }

  async function togglePromo(promo: PromoView) {
    if (previewMode) return;
    const response = await fetch('/api/admin/promos', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:promo.id,isActive:!promo.is_active}) });
    const data = await response.json();
    if (response.ok) setPromos((current) => current.map((item) => item.id === promo.id ? data.promo : item));
    else setPromoMessage(data.error || 'Не удалось изменить промокод');
  }

  async function searchTickets() {
    if (previewMode || ticketQuery.trim().length < 2) { setTicketResults([]); return; }
    setTicketSearching(true);
    try {
      const response = await fetch(`/api/admin/tickets?q=${encodeURIComponent(ticketQuery.trim())}`, { cache:'no-store' });
      const data = await response.json();
      if (response.ok) setTicketResults(data.tickets || []);
    } finally { setTicketSearching(false); }
  }

  async function searchBuyers(query = buyerQuery) {
    if (previewMode) return;
    setBuyerSearching(true);
    try {
      const response = await fetch(`/api/admin/buyers?q=${encodeURIComponent(query.trim())}`, { cache:'no-store' });
      const data = await response.json();
      if (response.ok) setBuyers(data.buyers || []);
    } finally { setBuyerSearching(false); }
  }

  async function saveEvent(status: "draft" | "published") {
    if (previewMode) { setEventMessage("Предпросмотр: форма выглядит и ведёт себя как настоящая, но ничего не записывает в базу."); return; }
    const shell = document.querySelector<HTMLElement>(".admin-editor");
    if (!shell) return;
    const value = (name: string) => (shell.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? "").trim();
    const posterInput = shell.querySelector<HTMLInputElement>('input[name="poster"]');
    setEventSaving(true); setEventMessage("");
    try {
      let posterImage = "";
      const file = posterInput?.files?.[0];
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        const upload = await fetch("/api/admin/upload-poster", { method: "POST", body: fd });
        const uploadData = await upload.json();
        if (!upload.ok) throw new Error(uploadData.error || "Не удалось загрузить афишу");
        posterImage = uploadData.url;
      }
      const date=value("date"), start=value("start"), end=value("end");
      const tickets = [{ id:"standard", name:value("ticketName") || "STANDARD", price:Number(value("ticketPrice")) || 0, note:"Вход на мероприятие", inventory:Number(value("ticketInventory")) || null, hotEnabled:false, themePrimary:"#2b0809",themeSecondary:"#7c1518",themeAccent:"#e12622" }];
      const response = await fetch("/api/admin/events", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:value("title"),startsAt:date&&start?`${date}T${start}:00+03:00`:"",endsAt:date&&end?`${date}T${end}:00+03:00`:null,ageLabel:value("age")||"14+",city:value("city")||"Йошкар-Ола",venue:value("venue"),address:value("address"),description:value("description"),secondaryDescription:value("secondaryDescription"),posterImage,status,salesState:status==="published"?"open":"coming-soon",ticketMode,tickets,themePrimary:"#220708",themeSecondary:"#751013",themeAccent:"#e12622"})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error||"Не удалось сохранить событие");
      setEventMessage(status === "published" ? `Опубликовано: /events/${data.slug}` : "Черновик сохранён в PostgreSQL");
    } catch(cause) { setEventMessage(cause instanceof Error ? cause.message : "Ошибка"); } finally { setEventSaving(false); }
  }
  const can = (permission: AdminPermission) => access.role === 'owner' || access.permissions.includes(permission);
  const canEvent = (slug: string) => access.role === 'owner' || access.allEvents || access.eventSlugs.includes(slug);
  const canCreateEvents = can('manage_events') && (access.role === 'owner' || access.allEvents);
  const visibleTabs = useMemo(() => tabs.filter(([id]) => access.role === 'owner' || tabPermissions[id].some((permission) => access.permissions.includes(permission))), [access.role, access.permissions]);
  const title = useMemo(() => tabs.find(([id]) => id === tab)?.[1] ?? '', [tab]);

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'is-mobile-open' : ''}`}>
        <div className="admin-sidebar-head">
          <a className="admin-brand" href="/" aria-label="AGAYO — сайт">
            <span className="brand-logo-mark" aria-hidden="true" />
          </a>
          <button
            className="admin-mobile-menu-toggle"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="admin-navigation"
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            <span>{mobileMenuOpen ? 'Закрыть' : 'Разделы'}</span>
            <i aria-hidden="true"><span /><span /></i>
          </button>
        </div>
        <div className="admin-role"><b>{ROLE_LABELS[access.role]}</b><span>{access.agayoId}</span></div>
        <nav id="admin-navigation" aria-label="Служебная навигация">
          {visibleTabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => {
                setTab(id);
                setCreating(false);
                setMobileMenuOpen(false);
              }}
              className={tab === id ? 'is-active' : ''}
            >
              <span>{label}</span><i className="admin-nav-chevron" aria-hidden="true" />
            </button>
          ))}
        </nav>
        <a className="admin-public" href="/">Открыть публичный сайт <i className="admin-external-mark" aria-hidden="true" /></a>
      </aside>

      <main className="admin-main">
        {previewMode ? <div className="admin-preview-banner">ПРЕДПРОСМОТР СЛУЖЕБНОЙ ЧАСТИ · ДАННЫЕ НЕ ИЗМЕНЯЮТСЯ · РЕАЛЬНЫЙ /admin ОСТАЁТСЯ ЗАЩИЩЁН</div> : null}
        <header className="admin-top">
          <div>
            <span>AGAYO / УПРАВЛЕНИЕ</span>
            <h1>{title}</h1>
          </div>

        </header>

        {tab === 'overview' && (
          <section className="admin-content">
            <div className="admin-metrics">
              {can('view_revenue') ? <article><span>ВЫРУЧКА</span><strong>{new Intl.NumberFormat('ru-RU').format(dashboard?.metrics.revenue ?? 0)} ₽</strong><small>подтверждённые оплаты</small></article> : null}
              <article><span>ПРОДАНО</span><strong>{String(dashboard?.metrics.sold ?? 0).padStart(2,'0')}</strong><small>действительных билетов</small></article>
              <article><span>ПРОШЛИ</span><strong>{String(dashboard?.metrics.used ?? 0).padStart(2,'0')}</strong><small>отсканированных QR</small></article>
              <article><span>ВОЗВРАТЫ / ОТМЕНЫ</span><strong>{String(dashboard?.metrics.refunds ?? 0).padStart(2,'0')}</strong><small>недействительных билетов</small></article>
            </div>

            <div className="admin-dashboard-grid">
              <article className="admin-panel admin-next-event">
                <div className="admin-panel-head"><span>БЛИЖАЙШЕЕ СОБЫТИЕ</span><b>{dashboard?.upcoming ? new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(dashboard.upcoming.starts_at)) : '—'}</b></div>
                <h2>{dashboard?.upcoming?.title ?? 'СОБЫТИЙ\nПОКА НЕТ'}</h2>
                <div className="admin-event-status">{dashboard?.upcoming ? <><span>ОПУБЛИКОВАНО</span><span>{dashboard.upcoming.sales_state === 'open' ? 'ПРОДАЖИ ОТКРЫТЫ' : 'ПРОДАЖИ НЕ ОТКРЫТЫ'}</span><span>{dashboard.upcoming.age_label}</span></> : <span>СОЗДАЙ НОВОЕ СОБЫТИЕ</span>}</div>
              </article>
              <article className="admin-panel admin-operations">
                <div className="admin-panel-head"><span>СЕГОДНЯ</span><b>LIVE</b></div>
                <div className="admin-operation-row"><span>Оплаченные заказы</span><strong>{String(dashboard?.today.newOrders ?? 0).padStart(2,'0')}</strong></div>
                <div className="admin-operation-row"><span>Новые пользователи</span><strong>{String(dashboard?.today.newUsers ?? 0).padStart(2,'0')}</strong></div>
                <div className="admin-operation-row"><span>Прошли по билетам</span><strong>{String(dashboard?.metrics.used ?? 0).padStart(2,'0')}</strong></div>
                <div className="admin-operation-row"><span>Ошибки / отмены оплат</span><strong>{String(dashboard?.today.paymentErrors ?? 0).padStart(2,'0')}</strong></div>
              </article>
            </div>

            <div className="admin-quick-actions">
              {canCreateEvents ? <button type="button" onClick={() => { setTab('events'); setCreating(true); }}>Создать событие <i className="admin-external-mark" aria-hidden="true" /></button> : null}
              {can('manual_ticket_search') || can('scan_tickets') ? <button type="button" onClick={() => setTab('tickets')}>Открыть билеты <i className="admin-external-mark" aria-hidden="true" /></button> : null}
              {can('manage_promos') ? <button type="button" onClick={() => setTab('promo')}>Создать промокод <i className="admin-external-mark" aria-hidden="true" /></button> : null}
              {can('manage_team') ? <button type="button" onClick={() => setTab('team')}>Добавить контролёра <i className="admin-external-mark" aria-hidden="true" /></button> : null}
            </div>
          </section>
        )}

        {tab === 'events' && (
          <section className="admin-content">
            <AdminEventsManager access={access} previewMode={previewMode} events={storedEvents} setEvents={setStoredEvents} />
          </section>
        )}

        {tab === 'tickets' && (
          <section className="admin-content">
            {can('manual_ticket_search') ? <div className="admin-toolbar"><input value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchTickets(); }} placeholder="Номер билета, имя, email, телефон или AGAYO ID" /><button className="admin-secondary" type="button" disabled={ticketSearching} onClick={() => void searchTickets()}>{ticketSearching ? 'Ищем…' : 'Найти'}</button></div> : null}
            <div className="admin-table-card">
              <div className="admin-table-head"><span>БИЛЕТ</span><span>СОБЫТИЕ</span><span>ВЛАДЕЛЕЦ</span><span>СТАТУС</span><span>КОНТАКТ</span></div>
              {ticketResults.length ? <div className="admin-data-list">{ticketResults.map((ticket) => <article key={ticket.id} className="admin-data-row">
                <div><small>БИЛЕТ</small><b>{ticket.public_id}</b><span>{ticket.category_name}</span></div>
                <div><small>СОБЫТИЕ</small><b>{ticket.event_slug}</b></div>
                <div><small>ВЛАДЕЛЕЦ</small><b>{ticket.owner_name}</b><span>{ticket.agayo_id || '—'}</span></div>
                <div><small>СТАТУС</small><b>{ticket.status === 'valid' ? 'ДЕЙСТВИТЕЛЕН' : ticket.status === 'used' ? 'ИСПОЛЬЗОВАН' : ticket.status.toUpperCase()}</b>{ticket.used_at ? <span>{new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(ticket.used_at))}</span> : null}</div>
                <div><small>КОНТАКТ</small><b>{ticket.email || ticket.phone || '—'}</b></div>
              </article>)}</div> : <div className="admin-table-empty"><strong>{ticketQuery.trim().length >= 2 ? 'НИЧЕГО НЕ НАЙДЕНО' : 'НАЙДИ БИЛЕТ'}</strong><p>Поиск идёт по номеру, имени, email, телефону и AGAYO ID. Статус берётся только из базы.</p></div>}
            </div>
            {can('scan_tickets') ? <div className="admin-scanner-card"><div><span>КОНТРОЛЬ ВХОДА</span><h2>SCANNER</h2><p>Backend сканера уже готов: первый успешный проход атомарно помечает билет использованным; повторный QR возвращает время предыдущего прохода, отменённый или возвращённый билет не пропускается.</p></div><a className="admin-primary admin-button-link" href="/admin/scanner">Открыть сканер</a></div> : null}
          </section>
        )}

        {tab === 'buyers' && (
          <section className="admin-content">
            <div className="admin-toolbar"><input value={buyerQuery} onChange={(event) => setBuyerQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchBuyers(); }} placeholder="Имя, email, телефон или AGAYO ID" /><button className="admin-secondary" type="button" disabled={buyerSearching} onClick={() => void searchBuyers()}>{buyerSearching ? 'Ищем…' : 'Найти'}</button></div>
            <div className="admin-table-card">
              <div className="admin-table-head buyers"><span>ПОЛЬЗОВАТЕЛЬ</span><span>КОНТАКТ</span><span>ПОСЕЩЕНИЯ</span><span>УРОВЕНЬ</span></div>
              {buyers.length ? <div className="admin-data-list">{buyers.map((buyer) => <article key={buyer.id} className="admin-data-row buyers">
                <div><small>ПОЛЬЗОВАТЕЛЬ</small><b>{buyer.display_name || 'Без имени'}</b><span>{buyer.agayo_id || '—'}</span></div>
                <div><small>КОНТАКТ</small><b>{buyer.email || buyer.phone || '—'}</b></div>
                <div><small>ПОСЕЩЕНИЯ</small><b>{buyer.visits}</b><span>{buyer.tickets} билетов всего</span></div>
                <div><small>УРОВЕНЬ</small><b>{buyer.loyalty_level}</b></div>
              </article>)}</div> : <div className="admin-table-empty"><strong>ПОКУПАТЕЛЕЙ ПОКА НЕТ</strong><p>После регистрации или первой покупки профиль появится здесь автоматически.</p></div>}
            </div>
          </section>
        )}

        {tab === 'promo' && (
          <section className="admin-content">
            <div className="admin-split admin-promo-layout">
              <div className="admin-editor compact admin-promo-editor"><span className="admin-kicker">НОВЫЙ ПРОМОКОД</span><h2>СКИДКА</h2><div className="admin-form-grid"><label><span>КОД</span><input name="promoCode" placeholder="AGAYO10" autoCapitalize="characters" /></label><label><span>ТИП</span><select name="promoType" defaultValue="percent"><option value="percent">Процент</option><option value="fixed">Фиксированная сумма</option></select></label><label><span>ЗНАЧЕНИЕ</span><input name="promoValue" placeholder="10" inputMode="numeric" /></label><label><span>ЛИМИТ</span><input name="promoLimit" placeholder="Без лимита" inputMode="numeric" /></label><label><span>ДО ДАТЫ</span><input name="promoExpires" type="date" /></label><label><span>СОБЫТИЕ</span><select name="promoEvent"><option value="">Все доступные события</option>{storedEvents.filter((event) => canEvent(event.slug)).map((event) => <option key={event.id} value={event.slug}>{event.title}</option>)}</select></label></div><div className="admin-promo-submit"><button className="admin-primary" type="button" disabled={promoSaving} onClick={() => void createPromo()}>{promoSaving ? 'СОЗДАЁМ…' : 'Создать промокод'}</button>{promoMessage ? <p>{promoMessage}</p> : null}</div></div>
              <div className="admin-table-card admin-promo-list">{promos.length ? <div className="admin-data-list">{promos.map((promo) => <article className="admin-promo-row" key={promo.id}><div><span>{promo.event_slug || 'ВСЕ СОБЫТИЯ'}</span><h3>{promo.code}</h3><p>{promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${promo.discount_value} ₽`} · использовано {promo.used_count}{promo.usage_limit ? ` / ${promo.usage_limit}` : ''}{promo.expires_at ? ` · до ${new Intl.DateTimeFormat('ru-RU').format(new Date(promo.expires_at))}` : ''}</p></div><button className="admin-secondary" type="button" onClick={() => void togglePromo(promo)}>{promo.is_active ? 'Выключить' : 'Включить'}</button></article>)}</div> : <div className="admin-table-empty"><strong>ПРОМОКОДОВ ПОКА НЕТ</strong><p>Созданные промокоды будут храниться в PostgreSQL вместе с лимитом, использованием и сроком действия.</p></div>}</div>
            </div>
          </section>
        )}

        {tab === 'media' && (
          <section className="admin-content"><div className="admin-split"><article className="admin-feature-card"><span>ГАЛЕРЕЯ</span><h2>ФОТО</h2><p>Загрузка фотографий по событиям, сортировка, удаление и выбор кадров для главной.</p><button className="admin-secondary" type="button">Добавить фотографии</button></article><article className="admin-feature-card"><span>ОТЗЫВЫ</span><h2>VOICE / TEXT</h2><p>Текстовые и голосовые отзывы добавляет только команда AGAYO.</p><button className="admin-secondary" type="button">Добавить отзыв</button></article></div></section>
        )}

        {tab === 'team' && can('manage_team') && (
          <section className="admin-content"><TeamAccessPanel currentAccess={access} previewMode={previewMode} /></section>
        )}

        {tab === 'settings' && (
          <section className="admin-content"><div className="admin-editor compact"><span className="admin-kicker">СИСТЕМА</span><h2>НАСТРОЙКИ</h2><div className="admin-settings-list"><article><div><b>ЮKassa</b><p>Платежи и возвраты</p></div><span>НЕ НАСТРОЕНО</span></article><article><div><b>Email</b><p>Коды входа и доставка билетов</p></div><span>НЕ НАСТРОЕНО</span></article><article><div><b>Telegram</b><p>Дополнительная доставка билетов</p></div><span>ПОЗЖЕ</span></article><article><div><b>PostgreSQL</b><p>Пользователи, заказы, билеты, события</p></div><span>СХЕМА ГОТОВА</span></article></div></div></section>
        )}
      </main>
    </div>
  );
}
