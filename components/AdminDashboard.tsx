'use client';

import { useEffect, useMemo, useState } from 'react';
import TeamAccessPanel from './TeamAccessPanel';
import AdminEventsManager, { type StoredEvent } from './AdminEventsManager';
import AdminMediaManager from './AdminMediaManager';
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
  tickets: ['scan_tickets', 'manual_ticket_search'],
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
type LoyaltyLevelView = { levelKey:string; displayName:string; visitsRequired:number; sortOrder:number };
type SystemStatusView = {
  database:{configured:boolean;reachable:boolean;schemaReady:boolean}; auth:{configured:boolean}; email:{configured:boolean}; blob:{configured:boolean};
  yookassa:{configured:boolean;paymentsEnabled:boolean}; fiscal:{required:boolean;configured:boolean;confirmed:boolean;ready:boolean}; sms:{configured:boolean};
  siteUrl:{configured:boolean;https:boolean}; owner:{configured:boolean}; readyForSales:boolean;
};

function SystemRow({name,note,ok,warn=false,optional=false}:{name:string;note:string;ok:boolean;warn?:boolean;optional?:boolean}) {
  return <article><div><b>{name}</b><p>{note}</p></div><span>{ok ? 'ГОТОВО' : optional ? 'ОПЦИОНАЛЬНО' : warn ? 'ПРОВЕРИТЬ' : 'НЕ ГОТОВО'}</span></article>;
}

function LoyaltyLevelEditor({level,onSave}:{level:LoyaltyLevelView;onSave:(level:LoyaltyLevelView,displayName:string,visitsRequired:number)=>Promise<void>}) {
  const [name,setName]=useState(level.displayName);
  const [visits,setVisits]=useState(level.visitsRequired);
  useEffect(()=>{setName(level.displayName);setVisits(level.visitsRequired);},[level.displayName,level.visitsRequired]);
  return <article><div><b>{level.levelKey}</b><p>Название: <input value={name} onChange={(event)=>setName(event.target.value)} /> · посещений: <input type="number" min="0" value={visits} onChange={(event)=>setVisits(Math.max(0,Number(event.target.value)||0))} /></p></div><button className="admin-secondary" type="button" onClick={()=>void onSave(level,name,visits)}>Сохранить</button></article>;
}

export default function AdminDashboard({ access, previewMode = false }: { access: AdminAccessView; previewMode?: boolean }) {
  const initialTab = tabs.find(([id]) => access.role === 'owner' || tabPermissions[id].some((permission) => access.permissions.includes(permission)))?.[0] ?? 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewHydrated, setPreviewHydrated] = useState(!previewMode);
  const [dashboard, setDashboard] = useState<DashboardData | null>(previewMode ? {metrics:{revenue:60900,sold:87,used:54,refunds:0},today:{newOrders:3,newUsers:2,paymentErrors:0},upcoming:{slug:'vernite-lampovost',title:'ВЕРНИТЕ ЛАМПОВОСТЬ',starts_at:'2026-09-12T17:30:00+03:00',status:'published',sales_state:'open',age_label:'14+'}} : null);
  const [storedEvents, setStoredEvents] = useState<StoredEvent[]>(previewMode ? [
    { id:'preview-lamp', slug:'vernite-lampovost', title:'ВЕРНИТЕ ЛАМПОВОСТЬ', starts_at:'2026-09-12T17:30:00+03:00', ends_at:'2026-09-12T21:00:00+03:00', status:'published', sales_state:'open', ticket_mode:'general-admission' },
    { id:'preview-night', slug:'agayo-night', title:'AGAYO NIGHT', starts_at:'2026-08-29T18:00:00+03:00', ends_at:'2026-08-29T21:00:00+03:00', status:'published', sales_state:'closed', ticket_mode:'zones' },
  ] : []);

  useEffect(() => {
    if (!previewMode) return;
    try { const saved=window.localStorage.getItem('agayo-preview-events'); if(saved){ const parsed=JSON.parse(saved); if(Array.isArray(parsed)&&parsed.length) setStoredEvents(parsed); } } catch {} finally { setPreviewHydrated(true); }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode && !previewHydrated) return;
    if (previewMode) { try { window.localStorage.setItem('agayo-preview-events', JSON.stringify(storedEvents)); } catch {} }
    const now=Date.now();
    const upcoming=storedEvents.filter(e=>e.status==='published'&&new Date(e.starts_at).getTime()>=now).sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime())[0];
    setDashboard(current=>({
      metrics:current?.metrics??(previewMode?{revenue:60900,sold:87,used:54,refunds:0}:{revenue:0,sold:0,used:0,refunds:0}),
      today:current?.today??(previewMode?{newOrders:3,newUsers:2,paymentErrors:0}:{newOrders:0,newUsers:0,paymentErrors:0}),
      upcoming:upcoming?{slug:upcoming.slug,title:upcoming.title,starts_at:upcoming.starts_at,status:upcoming.status,sales_state:upcoming.sales_state,age_label:'14+'}:null
    }));
  }, [previewMode, previewHydrated, storedEvents]);
  const [promos, setPromos] = useState<PromoView[]>([]);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoMessage, setPromoMessage] = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<TicketSearchView[]>([]);
  const [ticketSearching, setTicketSearching] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyers, setBuyers] = useState<BuyerView[]>([]);
  const [buyerSearching, setBuyerSearching] = useState(false);
  const [loyaltyLevels, setLoyaltyLevels] = useState<LoyaltyLevelView[]>([]);
  const [loyaltyMessage, setLoyaltyMessage] = useState('');
  const [systemStatus, setSystemStatus] = useState<SystemStatusView | null>(previewMode ? {database:{configured:true,reachable:true,schemaReady:true},auth:{configured:true},email:{configured:true},blob:{configured:true},yookassa:{configured:true,paymentsEnabled:false},fiscal:{required:false,configured:true,confirmed:false,ready:false},sms:{configured:false},siteUrl:{configured:true,https:true},owner:{configured:true},readyForSales:false} : null);

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

  useEffect(() => {
    if (previewMode || !can('manage_loyalty')) return;
    fetch('/api/admin/loyalty', { cache:'no-store' }).then(async (response) => {
      const data=await response.json(); if(response.ok) setLoyaltyLevels(data.levels||[]);
    }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  useEffect(() => {
    if (previewMode || !can('manage_system')) return;
    fetch('/api/admin/system/status', { cache:'no-store' }).then(async (response) => {
      const data=await response.json(); if(response.ok) setSystemStatus(data);
    }).catch(() => undefined);
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


  async function saveLoyaltyLevel(level:LoyaltyLevelView, displayName:string, visitsRequired:number) {
    if (previewMode) return;
    setLoyaltyMessage('');
    const response=await fetch('/api/admin/loyalty',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({levelKey:level.levelKey,displayName,visitsRequired})});
    const data=await response.json();
    if(response.ok){ setLoyaltyLevels((current)=>current.map((item)=>item.levelKey===level.levelKey?data.level:item)); setLoyaltyMessage('Уровень сохранён'); }
    else setLoyaltyMessage(data.error||'Не удалось сохранить уровень');
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
        {previewMode ? <div className="admin-preview-banner">ТЕСТОВАЯ ПЕСОЧНИЦА · ИЗМЕНЕНИЯ СОХРАНЯЮТСЯ ТОЛЬКО В ЭТОМ БРАУЗЕРЕ · РЕАЛЬНЫЙ /admin ОСТАЁТСЯ ЗАЩИЩЁН</div> : null}
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
              {canCreateEvents ? <button type="button" onClick={() => setTab('events')}>Создать событие <i className="admin-external-mark" aria-hidden="true" /></button> : null}
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
                <div><small>УРОВЕНЬ</small><b>{loyaltyLevels.find((level)=>level.levelKey===buyer.loyalty_level)?.displayName || buyer.loyalty_level}</b></div>
              </article>)}</div> : <div className="admin-table-empty"><strong>ПОКУПАТЕЛЕЙ ПОКА НЕТ</strong><p>После регистрации или первой покупки профиль появится здесь автоматически.</p></div>}
            </div>
            {can('manage_loyalty') ? <div className="admin-editor compact"><span className="admin-kicker">ЛОЯЛЬНОСТЬ</span><h2>УРОВНИ</h2><p className="admin-settings-note">Название GOLD и любого другого уровня можно менять вручную. Порог — количество реально использованных билетов.</p><div className="admin-settings-list">{loyaltyLevels.map((level)=><LoyaltyLevelEditor key={level.levelKey} level={level} onSave={saveLoyaltyLevel}/>)}</div>{loyaltyMessage?<p>{loyaltyMessage}</p>:null}</div> : null}
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
          <section className="admin-content"><AdminMediaManager events={storedEvents} access={access} previewMode={previewMode} /></section>
        )}

        {tab === 'team' && can('manage_team') && (
          <section className="admin-content"><TeamAccessPanel currentAccess={access} events={storedEvents} previewMode={previewMode} /></section>
        )}

        {tab === 'settings' && (
          <section className="admin-content"><div className="admin-editor compact"><span className="admin-kicker">СИСТЕМА</span><h2>PRODUCTION</h2><div className={`admin-production-readiness ${systemStatus?.readyForSales ? 'is-ready' : ''}`}><b>{systemStatus?.readyForSales ? 'ГОТОВО К ПРОДАЖАМ' : 'ЕЩЁ НЕ ГОТОВО К ПРОДАЖАМ'}</b><p>Статусы ниже показывают наличие production-настроек, но не раскрывают секретные ключи.</p></div><div className="admin-settings-list"><SystemRow name="PostgreSQL" note={systemStatus?.database.reachable && !systemStatus?.database.schemaReady ? 'Соединение есть, но нужно применить db/008_production_launch.sql' : 'Пользователи, заказы, билеты и события'} ok={Boolean(systemStatus?.database.reachable && systemStatus?.database.schemaReady)} warn={Boolean(systemStatus?.database.reachable && !systemStatus?.database.schemaReady)} /><SystemRow name="AUTH_SECRET" note="Подпись защищённых сессий AGAYO ID" ok={Boolean(systemStatus?.auth.configured)} /><SystemRow name="Email / Resend" note="Коды входа и доставка билетов" ok={Boolean(systemStatus?.email.configured)} /><SystemRow name="Vercel Blob" note="Афиши, фото и аудиоотзывы" ok={Boolean(systemStatus?.blob.configured)} /><SystemRow name="ЮKassa" note={systemStatus?.yookassa.paymentsEnabled ? 'Ключи заданы, платежи включены' : 'До финального теста PAYMENTS_ENABLED должен быть 0'} ok={Boolean(systemStatus?.yookassa.configured && systemStatus?.yookassa.paymentsEnabled)} warn={Boolean(systemStatus?.yookassa.configured && !systemStatus?.yookassa.paymentsEnabled)} /><SystemRow name="Фискализация" note={!systemStatus?.fiscal.confirmed ? 'Нужно подтвердить рабочую схему чеков перед стартом продаж' : systemStatus?.fiscal.required ? 'Передача данных чека через ЮKassa подтверждена' : 'Внешняя/кабинетная схема фискализации подтверждена'} ok={Boolean(systemStatus?.fiscal.ready)} warn={Boolean(systemStatus?.fiscal.configured && !systemStatus?.fiscal.confirmed)} /><SystemRow name="Production URL" note="HTTPS-адрес возврата и webhook" ok={Boolean(systemStatus?.siteUrl.configured && systemStatus?.siteUrl.https)} /><SystemRow name="Владелец AGAYO" note="Bootstrap-доступ к админке" ok={Boolean(systemStatus?.owner.configured)} /><SystemRow name="SMS.RU" note="Не обязателен для продаж: email-вход работает отдельно" ok={Boolean(systemStatus?.sms.configured)} optional /></div></div></section>
        )}
      </main>
    </div>
  );
}
