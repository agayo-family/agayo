'use client';

import { useMemo, useState } from 'react';
import TeamAccessPanel from './TeamAccessPanel';
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


type AdminAccessView = {
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

const statCards = [
  ['ВЫРУЧКА', '0 ₽', 'после реальных продаж'],
  ['ПРОДАНО', '00', 'оплаченных билетов'],
  ['ПРОШЛИ', '00', 'отсканированных QR'],
  ['ВОЗВРАТЫ', '00', 'билетов'],
];

export default function AdminDashboard({ access }: { access: AdminAccessView }) {
  const initialTab = tabs.find(([id]) => access.role === 'owner' || tabPermissions[id].some((permission) => access.permissions.includes(permission)))?.[0] ?? 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [creating, setCreating] = useState(false);
  const [ticketMode, setTicketMode] = useState<'zones' | 'seats' | 'free-entry'>('zones');
  const can = (permission: AdminPermission) => access.role === 'owner' || access.permissions.includes(permission);
  const canEvent = (slug: string) => access.role === 'owner' || access.allEvents || access.eventSlugs.includes(slug);
  const canCreateEvents = can('manage_events') && (access.role === 'owner' || access.allEvents);
  const visibleTabs = useMemo(() => tabs.filter(([id]) => access.role === 'owner' || tabPermissions[id].some((permission) => access.permissions.includes(permission))), [access.role, access.permissions]);
  const title = useMemo(() => tabs.find(([id]) => id === tab)?.[1] ?? '', [tab]);

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/" aria-label="AGAYO — сайт">
          <span className="brand-logo-mark" aria-hidden="true" />
        </a>
        <div className="admin-role"><b>{ROLE_LABELS[access.role]}</b><span>{access.agayoId}</span></div>
        <nav aria-label="Служебная навигация">
          {visibleTabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => {
                setTab(id);
                setCreating(false);
              }}
              className={tab === id ? 'is-active' : ''}
            >
              <span>{label}</span><b>↗</b>
            </button>
          ))}
        </nav>
        <a className="admin-public" href="/">Открыть публичный сайт ↗</a>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <div>
            <span>AGAYO / УПРАВЛЕНИЕ</span>
            <h1>{title}</h1>
          </div>
          {tab === 'events' && canCreateEvents && (
            <button className="admin-primary" type="button" onClick={() => setCreating((v) => !v)}>
              {creating ? 'Закрыть редактор' : '＋ Создать событие'}
            </button>
          )}
        </header>

        {tab === 'overview' && (
          <section className="admin-content">
            <div className="admin-metrics">
              {statCards.filter(([label]) => label !== 'ВЫРУЧКА' || can('view_revenue')).map(([label, value, note]) => (
                <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
              ))}
            </div>

            <div className="admin-dashboard-grid">
              <article className="admin-panel admin-next-event">
                <div className="admin-panel-head"><span>БЛИЖАЙШЕЕ СОБЫТИЕ</span><b>12.09.26</b></div>
                <h2>ВЕРНИТЕ<br />ЛАМПОВОСТЬ</h2>
                <div className="admin-event-status"><span>ОПУБЛИКОВАНО</span><span>ПРОДАЖИ ОТКРЫТЫ</span><span>14+</span></div>
              </article>
              <article className="admin-panel admin-operations">
                <div className="admin-panel-head"><span>СЕГОДНЯ</span><b>LIVE</b></div>
                <div className="admin-operation-row"><span>Новые заказы</span><strong>00</strong></div>
                <div className="admin-operation-row"><span>Новые пользователи</span><strong>00</strong></div>
                <div className="admin-operation-row"><span>Письма с билетами</span><strong>00</strong></div>
                <div className="admin-operation-row"><span>Ошибки оплаты</span><strong>00</strong></div>
              </article>
            </div>

            <div className="admin-quick-actions">
              {canCreateEvents ? <button type="button" onClick={() => { setTab('events'); setCreating(true); }}>Создать событие ↗</button> : null}
              {can('manual_ticket_search') || can('scan_tickets') ? <button type="button" onClick={() => setTab('tickets')}>Открыть билеты ↗</button> : null}
              {can('manage_promos') ? <button type="button" onClick={() => setTab('promo')}>Создать промокод ↗</button> : null}
              {can('manage_team') ? <button type="button" onClick={() => setTab('team')}>Добавить контролёра ↗</button> : null}
            </div>
          </section>
        )}

        {tab === 'events' && (
          <section className="admin-content">
            {creating ? (
              <div className="admin-editor">
                <div className="admin-editor-title"><span>НОВОЕ СОБЫТИЕ</span><h2>СОЗДАТЬ<br />МЕРОПРИЯТИЕ</h2></div>

                <div className="admin-editor-section">
                  <div className="admin-section-heading"><span>01</span><div><b>ОСНОВНОЕ</b><small>То, что увидит гость на странице события.</small></div></div>
                  <div className="admin-form-grid">
                    <label><span>НАЗВАНИЕ</span><input placeholder="Название события" /></label>
                    <label><span>ДАТА</span><input type="date" /></label>
                    <label><span>НАЧАЛО</span><input type="time" /></label>
                    <label><span>ОКОНЧАНИЕ</span><input type="time" /></label>
                    <label><span>ВОЗРАСТ</span><input placeholder="14+" /></label>
                    <label><span>ГОРОД</span><input defaultValue="Йошкар-Ола" /></label>
                    <label><span>ПЛОЩАДКА</span><input placeholder="Название площадки" /></label>
                    <label><span>АДРЕС</span><input placeholder="Адрес" /></label>
                    <label className="admin-wide"><span>ОПИСАНИЕ</span><textarea placeholder="Что человек должен почувствовать и узнать о событии?" /></label>
                  </div>
                </div>

                <div className="admin-editor-section">
                  <div className="admin-section-heading"><span>02</span><div><b>АФИША И АТМОСФЕРА</b><small>Афиша становится визуальной основой страницы и билетов.</small></div></div>
                  <label className="admin-upload">
                    <input type="file" accept="image/*" />
                    <strong>＋ ЗАГРУЗИТЬ АФИШУ</strong>
                    <small>JPG / PNG / WEBP. После подключения хранилища изображение будет сохраняться на сервере.</small>
                  </label>
                  <div className="admin-theme-preview">
                    <div><span>ПАЛИТРА ИЗ АФИШИ</span><small>Можно будет поправить вручную.</small></div>
                    <div className="admin-swatches"><i /><i /><i /></div>
                  </div>
                </div>

                <div className="admin-editor-section">
                  <div className="admin-section-heading"><span>03</span><div><b>ТИП ПРОДАЖИ</b><small>Обычный вход, зоны или конкретные места.</small></div></div>
                  <div className="admin-mode-grid">
                    <button type="button" className={ticketMode === 'free-entry' ? 'is-active' : ''} onClick={() => setTicketMode('free-entry')}><b>ОБЩИЙ ВХОД</b><small>Без категорий и мест</small></button>
                    <button type="button" className={ticketMode === 'zones' ? 'is-active' : ''} onClick={() => setTicketMode('zones')}><b>ЗОНЫ</b><small>STANDARD / PREMIUM / VIP</small></button>
                    <button type="button" className={ticketMode === 'seats' ? 'is-active' : ''} onClick={() => setTicketMode('seats')}><b>МЕСТА</b><small>Конкретное кресло / стол</small></button>
                  </div>
                </div>

                {ticketMode !== 'free-entry' && (
                  <div className="admin-editor-section">
                    <div className="admin-section-heading"><span>04</span><div><b>КАТЕГОРИИ БИЛЕТОВ</b><small>Каждый тип получит свою вариацию палитры события.</small></div></div>
                    <div className="admin-ticket-row"><input defaultValue="STANDARD" /><input defaultValue="700" inputMode="numeric" /><input placeholder="Количество" inputMode="numeric" /><button type="button">Удалить</button></div>
                    <div className="admin-ticket-row"><input defaultValue="PREMIUM" /><input defaultValue="1200" inputMode="numeric" /><input placeholder="Количество" inputMode="numeric" /><button type="button">Удалить</button></div>
                    <button className="admin-secondary" type="button">＋ Добавить категорию</button>
                    <label className="admin-hot-toggle"><input type="checkbox" /> <span>🔥 Включить «Горячие билеты»</span><small>Отображаемый остаток задаётся отдельно от фактического.</small></label>
                  </div>
                )}

                <div className="admin-editor-section">
                  <div className="admin-section-heading"><span>05</span><div><b>ПУБЛИКАЦИЯ</b><small>Перед публикацией можно открыть предпросмотр.</small></div></div>
                  <div className="admin-publish-options">
                    <label><input type="checkbox" defaultChecked /> Продажи открыты</label>
                    <label><input type="checkbox" /> Именные билеты</label>
                    <label><input type="checkbox" /> Разрешить передачу билета</label>
                  </div>
                </div>

                <div className="admin-editor-actions"><button className="admin-secondary" type="button">Предпросмотр</button><button className="admin-secondary" type="button">Сохранить черновик</button><button className="admin-primary" type="button">Опубликовать</button></div>
                <p className="admin-dev-note">Сейчас это интерфейс конструктора. Он специально не записывает изменения в localStorage: на следующем серверном шаге подключим сохранение в PostgreSQL, роли и реальную загрузку афиш.</p>
              </div>
            ) : (
              <div className="admin-event-list">
                {canEvent('vernite-lampovost') ? <article><div><span>12.09.26 · 17:30—21:00</span><h2>ВЕРНИТЕ ЛАМПОВОСТЬ</h2><p>Опубликовано · продажи открыты · STANDARD 700 ₽</p></div><div className="admin-list-actions"><button type="button">Редактировать ↗</button>{can('view_statistics') ? <button type="button">Статистика ↗</button> : null}</div></article> : null}
                {canEvent('agayo-night') ? <article className="is-archive"><div><span>29.08.26</span><h2>AGAYO NIGHT</h2><p>Архив · продажи закрыты</p></div><div className="admin-list-actions"><button type="button">Открыть ↗</button></div></article> : null}
                {!canEvent('vernite-lampovost') && !canEvent('agayo-night') ? <div className="admin-table-empty"><strong>НЕТ ДОСТУПНЫХ МЕРОПРИЯТИЙ</strong><p>OWNER или администратор может открыть тебе конкретные события в разделе «Команда».</p></div> : null}
              </div>
            )}
          </section>
        )}

        {tab === 'tickets' && (
          <section className="admin-content">
            <div className="admin-toolbar"><input placeholder="Номер билета, имя, email или телефон" /><button className="admin-secondary" type="button">Найти</button></div>
            <div className="admin-table-card">
              <div className="admin-table-head"><span>БИЛЕТ</span><span>СОБЫТИЕ</span><span>ВЛАДЕЛЕЦ</span><span>СТАТУС</span><span>ДЕЙСТВИЯ</span></div>
              <div className="admin-table-empty"><strong>БИЛЕТОВ ПОКА НЕТ</strong><p>После первой подтверждённой оплаты здесь появятся реальные билеты, QR-статусы, возвраты и отмены.</p></div>
            </div>
            <div className="admin-scanner-card"><div><span>КОНТРОЛЬ ВХОДА</span><h2>SCANNER</h2><p>Мобильный сканер будет использовать тот же backend: первый проход помечает билет использованным, повторный показывает время и контролёра.</p></div><button className="admin-primary" type="button">Открыть сканер позже</button></div>
          </section>
        )}

        {tab === 'buyers' && (
          <section className="admin-content">
            <div className="admin-toolbar"><input placeholder="Имя, email, телефон или AGAYO ID" /><button className="admin-secondary" type="button">Найти</button></div>
            <div className="admin-table-card"><div className="admin-table-head buyers"><span>ПОЛЬЗОВАТЕЛЬ</span><span>КОНТАКТ</span><span>ПОСЕЩЕНИЯ</span><span>УРОВЕНЬ</span></div><div className="admin-table-empty"><strong>БАЗА ПОКУПАТЕЛЕЙ ПУСТА</strong><p>Профили будут создаваться автоматически после покупки или входа по одноразовому коду.</p></div></div>
          </section>
        )}

        {tab === 'promo' && (
          <section className="admin-content">
            <div className="admin-split">
              <div className="admin-editor compact"><span className="admin-kicker">НОВЫЙ ПРОМОКОД</span><h2>СКИДКА</h2><div className="admin-form-grid"><label><span>КОД</span><input placeholder="AGAYO10" /></label><label><span>ТИП</span><select><option>Процент</option><option>Фиксированная сумма</option></select></label><label><span>ЗНАЧЕНИЕ</span><input placeholder="10" /></label><label><span>ЛИМИТ</span><input placeholder="100" /></label><label><span>ДО ДАТЫ</span><input type="date" /></label><label><span>СОБЫТИЕ</span><select><option>Все события</option><option>ВЕРНИТЕ ЛАМПОВОСТЬ</option></select></label></div><button className="admin-primary" type="button">Создать промокод</button></div>
              <div className="admin-table-card"><div className="admin-table-empty"><strong>АКТИВНЫХ ПРОМОКОДОВ НЕТ</strong><p>После подключения базы будут видны использование, лимиты и срок действия.</p></div></div>
            </div>
          </section>
        )}

        {tab === 'media' && (
          <section className="admin-content"><div className="admin-split"><article className="admin-feature-card"><span>ГАЛЕРЕЯ</span><h2>ФОТО</h2><p>Загрузка фотографий по событиям, сортировка, удаление и выбор кадров для главной.</p><button className="admin-secondary" type="button">Добавить фотографии</button></article><article className="admin-feature-card"><span>ОТЗЫВЫ</span><h2>VOICE / TEXT</h2><p>Текстовые и голосовые отзывы добавляет только команда AGAYO.</p><button className="admin-secondary" type="button">Добавить отзыв</button></article></div></section>
        )}

        {tab === 'team' && can('manage_team') && (
          <section className="admin-content"><TeamAccessPanel currentAccess={access} /></section>
        )}

        {tab === 'settings' && (
          <section className="admin-content"><div className="admin-editor compact"><span className="admin-kicker">СИСТЕМА</span><h2>НАСТРОЙКИ</h2><div className="admin-settings-list"><article><div><b>ЮKassa</b><p>Платежи и возвраты</p></div><span>НЕ НАСТРОЕНО</span></article><article><div><b>Email</b><p>Коды входа и доставка билетов</p></div><span>НЕ НАСТРОЕНО</span></article><article><div><b>Telegram</b><p>Дополнительная доставка билетов</p></div><span>ПОЗЖЕ</span></article><article><div><b>PostgreSQL</b><p>Пользователи, заказы, билеты, события</p></div><span>СХЕМА ГОТОВА</span></article></div></div></section>
        )}
      </main>
    </div>
  );
}
