'use client';

import { useCallback, useEffect, useState } from 'react';

type Diagnostics = {
  configuration: { configured: boolean; senderDomain: string | null; sandbox: boolean; productionReady: boolean; note: string };
  counts: { total: number; accepted: number; failed: number; pending: number };
  failures: { ticketId: string; orderId: string; status: string; attempts: number; hint: string }[];
};

export default function AdminEmailDelivery({ previewMode = false }: { previewMode?: boolean }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async (orderId?: string) => {
    if (previewMode) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/system/email', orderId
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) }
        : { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось проверить доставку');
      setData(result);
      if (orderId) setMessage(result.completed ? 'Проверка отправки завершена. Актуальные статусы ниже.' : 'Отправка пока не подтверждена. Причина указана ниже.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка проверки'); }
    finally { setBusy(false); }
  }, [previewMode]);
  useEffect(() => { void load(); }, [load]);

  return <section className="admin-editor compact" aria-label="Доставка билетов">
    <span className="admin-kicker">ДОСТАВКА БИЛЕТОВ</span><h2>ПИСЬМА И ПОВТОРЫ</h2>
    <p>Статус «принято» означает подтверждение службы доставки. Получение письма в почтовый ящик проверяется в журнале Resend.</p>
    {previewMode ? <p>Диагностика доступна в рабочей админке владельца.</p> : <>
      {data ? <>
        <p role="status">{data.configuration.note}</p>
        <p>Домен отправителя: <strong>{data.configuration.senderDomain || 'не задан'}</strong>. Принято: {data.counts.accepted}. Ошибки: {data.counts.failed}. Ожидают: {data.counts.pending}.</p>
        {data.failures.map(item => <article className="admin-ticket-message-v133" key={item.ticketId}>
          <strong>{item.ticketId} · {item.orderId}</strong><p>{item.hint} Попыток: {item.attempts}.</p>
          <button type="button" className="admin-secondary" disabled={busy} onClick={() => void load(item.orderId)}>Повторить неотправленные билеты заказа</button>
        </article>)}
      </> : null}
      <button type="button" className="admin-secondary" disabled={busy} onClick={() => void load()}>{busy ? 'Проверяем…' : 'Обновить доставку'}</button>
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
