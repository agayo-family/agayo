'use client';

import { useEffect, useRef, useState } from 'react';
import type { StoredEvent } from './AdminEventsManager';

type Campaign = { id: string; event_slug: string; category_id: string; title: string; description: string; levels: string[]; version: number; recipients: number; issued: number; sent: number; failed: number };
type Level = { levelKey: string; displayName: string };
type Category = { id: string; name: string };
type Result = { campaigns: Campaign[]; delivery?: { sent: number; failed: number } };

export default function AdminPersonalTicketsManager({ events, levels, previewMode }: { events: StoredEvent[]; levels: Level[]; previewMode: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [slug, setSlug] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('Для своих');
  const [description, setDescription] = useState('Персональное приглашение от команды AGAYO. До встречи!');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const eligible = events.filter(event => event.status === 'published' && event.ticket_mode !== 'seats' && (previewMode || Date.parse(event.ends_at || event.starts_at) > Date.now()));
  const availableLevels = levels.length ? levels : previewMode ? [{ levelKey: 'GOLD', displayName: 'GOLD' }, { levelKey: 'LEGEND', displayName: 'LEGEND' }] : [];

  useEffect(() => {
    alive.current = true;
    if (!previewMode) {
      const abort = new AbortController();
      fetch('/api/admin/personal-tickets', { cache: 'no-store', signal: abort.signal }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить выпуски');
        if (alive.current) setCampaigns(data.campaigns);
      }).catch(error => { if (alive.current && !abort.signal.aborted) setMessage(error.message); });
      return () => { alive.current = false; abort.abort(); };
    }
    return () => { alive.current = false; };
  }, [previewMode]);

  useEffect(() => {
    setCategories([]); setCategory('');
    if (!slug) return;
    if (previewMode) { setCategories([{ id: 'standard', name: 'STANDARD' }]); setCategory('standard'); return; }
    const abort = new AbortController();
    fetch(`/api/admin/personal-tickets?event=${encodeURIComponent(slug)}`, { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Категории недоступны');
      setCategories(data.categories); setCategory(data.categories[0]?.id || '');
    }).catch(error => { if (!abort.signal.aborted) setMessage(error.message); });
    return () => abort.abort();
  }, [slug, previewMode]);

  async function request(body: Record<string, unknown>): Promise<Result> {
    const response = await fetch('/api/admin/personal-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Действие не выполнено');
    if (alive.current) setCampaigns(data.campaigns);
    return data;
  }

  async function prepare() {
    setBusy(true); setMessage('');
    try {
      if (previewMode) {
        setCampaigns(current => [{ id: crypto.randomUUID(), event_slug: slug, category_id: category, title, description, levels: selected, version: 1, recipients: 3, issued: 0, sent: 0, failed: 0 }, ...current]);
        setMessage('Пример подготовлен. В деморежиме билеты и письма не создаются.');
      } else {
        await request({ action: 'create', eventSlug: slug, categoryId: category, title, description, levels: selected });
        setMessage('Получатели выбраны. Проверь число гостей и описание, затем нажми «Выдать бесплатно».');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка'); }
    finally { if (alive.current) setBusy(false); }
  }

  async function deliver(campaign: Campaign, retry = false) {
    setBusy(true); setMessage('');
    try {
      if (previewMode) {
        setCampaigns(current => current.map(item => item.id === campaign.id ? { ...item, issued: item.recipients, sent: item.recipients, failed: 0 } : item));
        setMessage('Демонстрация выдачи. Реальным гостям ничего не отправлено.');
        return;
      }
      let current = campaign;
      do {
        const before = `${current.issued}:${current.sent}`;
        const action = retry || current.issued >= current.recipients ? 'retry' : 'issue';
        const result = await request({ action, id: campaign.id });
        current = result.campaigns.find(item => item.id === campaign.id) || current;
        if (!alive.current) break;
        setMessage(`Выдано ${current.issued} из ${current.recipients}. Доставлено ${current.sent}.`);
        if (result.delivery?.failed) { setMessage(`Выдано ${current.issued}, доставлено ${current.sent}. Часть писем не доставлена — используй повторную отправку.`); break; }
        if (`${current.issued}:${current.sent}` === before) { setMessage('Выпуск приостановлен: нет новых получателей или доставка уже выполняется. Можно продолжить позже.'); break; }
      } while (alive.current && (retry ? current.sent < current.issued : current.issued < current.recipients || current.sent < current.issued));
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : 'Ошибка'); }
    finally { if (alive.current) setBusy(false); }
  }

  async function edit(campaign: Campaign, nextTitle: string, nextDescription: string) {
    setBusy(true); setMessage('');
    try {
      if (previewMode) setCampaigns(current => current.map(item => item.id === campaign.id ? { ...item, title: nextTitle, description: nextDescription, version: item.version + 1 } : item));
      else await request({ action: 'edit', id: campaign.id, version: campaign.version, title: nextTitle, description: nextDescription });
      setMessage('Описание обновлено в профиле и открытом билете. Уже отправленные письма сохраняют прежний текст.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка'); }
    finally { if (alive.current) setBusy(false); }
  }

  return <div className="admin-editor admin-personal-tickets">
    <span className="admin-kicker">ПРИГЛАШЕНИЯ ПО УРОВНЯМ AGAYO ID</span><h2>ПЕРСОНАЛЬНЫЕ БИЛЕТЫ</h2>
    <p className="admin-settings-note">Каждый выбранный гость получит один бесплатный билет и письмо. Билеты учитываются в лимите категории. Подготовка показывает число получателей; выдача начинается отдельной кнопкой. Для нового приглашения на то же событие создай новый выпуск.</p>
    <div className="admin-form-grid">
      <label><span>СОБЫТИЕ</span><select value={slug} disabled={busy} onChange={event => setSlug(event.target.value)}><option value="">Выбрать событие</option>{eligible.map(event => <option key={event.id} value={event.slug}>{event.title}</option>)}</select></label>
      <label><span>КАТЕГОРИЯ</span><select value={category} disabled={busy || !categories.length} onChange={event => setCategory(event.target.value)}><option value="">Выбрать категорию</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>НАЗВАНИЕ ДЛЯ ГОСТЯ</span><input value={title} maxLength={80} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
      <label><span>ОПИСАНИЕ ДЛЯ ГОСТЯ</span><textarea value={description} maxLength={600} rows={4} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
    </div>
    <fieldset className="personal-levels"><legend>УРОВНИ ПОЛУЧАТЕЛЕЙ</legend>{availableLevels.map(level => <label key={level.levelKey}><input type="checkbox" checked={selected.includes(level.levelKey)} disabled={busy} onChange={event => setSelected(current => event.target.checked ? [...current, level.levelKey] : current.filter(key => key !== level.levelKey))} />{level.displayName}</label>)}</fieldset>
    <button className="admin-primary" type="button" disabled={busy || !slug || !category || !title.trim() || !description.trim() || !selected.length} onClick={() => void prepare()}>{busy ? 'Выполняем…' : 'Подготовить и посчитать гостей'}</button>
    {message ? <p className="admin-personal-message" role="status">{message}</p> : null}
    {campaigns.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} title={events.find(event => event.slug === campaign.event_slug)?.title || campaign.event_slug} busy={busy} onDeliver={retry => void deliver(campaign, retry)} onSave={(title, description) => void edit(campaign, title, description)} />)}
  </div>;
}

function CampaignCard({ campaign, title, busy, onDeliver, onSave }: { campaign: Campaign; title: string; busy: boolean; onDeliver: (retry: boolean) => void; onSave: (title: string, description: string) => void }) {
  const [name, setName] = useState(campaign.title), [description, setDescription] = useState(campaign.description);
  useEffect(() => { setName(campaign.title); setDescription(campaign.description); }, [campaign.title, campaign.description]);
  return <article className="personal-campaign"><h3>{title.toLocaleUpperCase('ru-RU')}</h3><p>{campaign.levels.join(' · ')} · Получателей: {campaign.recipients} · Выдано: {campaign.issued} · Доставлено: {campaign.sent}{campaign.failed ? ` · Ошибок доставки: ${campaign.failed}` : ''}</p>
    <label><span>НАЗВАНИЕ</span><input value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <label><span>ОПИСАНИЕ В БИЛЕТЕ</span><textarea value={description} maxLength={600} rows={3} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
    <div className="personal-campaign-actions"><button className="admin-secondary" type="button" disabled={busy || !name.trim() || !description.trim() || (name === campaign.title && description === campaign.description)} onClick={() => onSave(name, description)}>Сохранить описание</button>
      {campaign.issued < campaign.recipients ? <button className="admin-primary" type="button" disabled={busy} onClick={() => onDeliver(false)}>Выдать бесплатно · {campaign.recipients - campaign.issued}</button> : null}
      {campaign.sent < campaign.issued ? <button className="admin-secondary" type="button" disabled={busy} onClick={() => onDeliver(true)}>Повторить доставку</button> : null}
    </div>
  </article>;
}
