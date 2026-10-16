'use client';

import { useEffect, useState } from 'react';

type Event = { slug: string; title: string; tickets: { id: string; name: string }[] };
export default function AdminIndividualTicketsManager() {
  const [events, setEvents] = useState<Event[]>([]), [slug, setSlug] = useState('');
  const [email, setEmail] = useState(''), [category, setCategory] = useState('');
  const [requestId, setRequestId] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  const event = events.find(item => item.slug === slug);
  useEffect(() => {
    setRequestId(crypto.randomUUID());
    const abort = new AbortController();
    fetch('/api/admin/personal-tickets/individual-events', { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить события для выдачи');
      setEvents(data.events || []);
    }).catch(error => { if (!abort.signal.aborted) setMessage(error.message); });
    return () => abort.abort();
  }, []);
  function reset() { setRequestId(crypto.randomUUID()); setFinished(false); setMessage(''); }
  async function issue() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/personal-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'individual', eventSlug: slug, categoryId: category, email, requestId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Выдача не завершилась. Повтори этот же запрос');
      setMessage(data.message); setFinished(!data.delivery?.failed);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Выдача не завершилась'); }
    finally { setBusy(false); }
  }
  return <section className="admin-editor admin-personal-tickets" aria-label="Выдача бесплатного билета">
    <span className="admin-kicker">ПРИГЛАШЕНИЕ ОДНОМУ ГОСТЮ</span><h2>ВЫДАТЬ БЕСПЛАТНЫЙ БИЛЕТ</h2>
    <p className="admin-settings-note">Выбери событие, категорию и email. Гость получит один билет с QR, который также появится в его аккаунте. Оплата не создаётся; билет занимает место в лимите категории.</p>
    <div className="admin-form-grid">
      <label><span>СОБЫТИЕ</span><select value={slug} disabled={busy || finished} onChange={e => { reset(); setSlug(e.target.value); setCategory(''); }}><option value="">Выбрать событие</option>{events.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>
      <label><span>КАТЕГОРИЯ</span><select value={category} disabled={busy || finished || !event} onChange={e => { reset(); setCategory(e.target.value); }}><option value="">Выбрать категорию</option>{event?.tickets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>EMAIL ГОСТЯ</span><input type="email" value={email} maxLength={254} disabled={busy || finished} onChange={e => { reset(); setEmail(e.target.value); }} placeholder="guest@example.ru" /></label>
    </div>
    {finished ? <button className="admin-secondary" type="button" onClick={() => { reset(); setEmail(''); }}>Выдать другому гостю</button>
      : <button className="admin-primary" type="button" disabled={busy || !slug || !category || !email.trim() || !requestId} onClick={() => void issue()}>{busy ? 'Выдаём и отправляем…' : 'Выдать и отправить бесплатно'}</button>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
