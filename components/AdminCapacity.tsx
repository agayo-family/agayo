'use client';
import { useState } from 'react';
type Capacity = { databaseBytes: number; counts: Record<string, number>; measuredAt: string; blob: { configured: boolean; scanned: boolean; bytes?: number; files?: number; partial?: boolean; error?: string } };
const size = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} ГБ` : `${(bytes / 1e6).toFixed(1)} МБ`;
export default function AdminCapacity({ previewMode }: { previewMode: boolean }) {
  const [data, setData] = useState<Capacity | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function measure(blob = false) {
    setBusy(true); setMessage('');
    try {
      if (previewMode) { setMessage('Измерение доступно владельцу в рабочей админке. Деморежим не обращается к базе.'); return; }
      const response = await fetch(`/api/admin/system/capacity${blob ? '?blob=1' : ''}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Измерение не удалось');
      setData(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка'); }
    finally { setBusy(false); }
  }
  return <div className="admin-editor compact admin-personal-tickets"><span className="admin-kicker">БАЗА И ФОТОГРАФИИ</span><h2>ОБЪЁМ ХРАНИЛИЩА</h2><p className="admin-settings-note">База хранит аккаунты, события и билеты. Файлы фотографий хранятся отдельно в Blob. Измерение показывает фактический объём; остаток квоты нужно сверять с тарифом провайдера.</p><div className="personal-campaign-actions"><button className="admin-secondary" disabled={busy} type="button" onClick={() => void measure()}>{busy ? 'Измеряем…' : 'Измерить базу'}</button><button className="admin-secondary" disabled={busy} type="button" onClick={() => void measure(true)}>База + файлы Blob</button></div>{message ? <p role="status">{message}</p> : null}{data ? <div className="admin-settings-list"><SystemSize label="База PostgreSQL" value={size(data.databaseBytes)} /><SystemSize label="Мероприятия / фото / аккаунты" value={`${data.counts.events} / ${data.counts.photos} / ${data.counts.accounts}`} /><SystemSize label="Билеты / заказы" value={`${data.counts.tickets} / ${data.counts.orders}`} />{data.blob.scanned ? <SystemSize label={data.blob.partial ? 'Blob · частичное измерение' : 'Blob · все файлы'} value={`${size(data.blob.bytes || 0)} · ${data.blob.files} файлов`} /> : <p>{data.blob.error || (data.blob.configured ? 'Для измерения фотографий нажми «База + файлы Blob».' : 'Blob не подключён.')}</p>}<p>Измерено: {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(data.measuredAt))}. Тариф и свободная квота не подтверждены.</p></div> : null}</div>;
}
function SystemSize({ label, value }: { label: string; value: string }) { return <article><b>{label}</b><span>{value}</span></article>; }
