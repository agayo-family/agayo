"use client";

import { useEffect, useMemo, useState } from "react";

type Period = {
  from: string;
  to: string;
  newOrders: number;
  newUsers: number;
  usedTickets: number;
  paymentErrors: number;
  revenue: number;
};

function moscowDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function prettyDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export default function AdminPeriodSummary({ previewMode = false, canSeeRevenue = false }: { previewMode?: boolean; canSeeRevenue?: boolean }) {
  const today = useMemo(() => moscowDate(), []);
  const yesterday = useMemo(() => moscowDate(-1), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState<Period>(previewMode ? { from: today, to: today, newOrders: 3, newUsers: 2, usedTickets: 4, paymentErrors: 0, revenue: 6900 } : { from: today, to: today, newOrders: 0, newUsers: 0, usedTickets: 0, paymentErrors: 0, revenue: 0 });
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState("");

  async function load(nextFrom = from, nextTo = to) {
    if (previewMode) {
      setPeriod((current) => ({ ...current, from: nextFrom, to: nextTo }));
      return;
    }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/dashboard?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить сводку");
      setPeriod(data.period);
      setFrom(data.period.from);
      setTo(data.period.to);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(today, today); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [previewMode]);

  function preset(date: string) {
    setFrom(date); setTo(date); void load(date, date);
  }

  const title = period.from === period.to ? prettyDate(period.from) : `${prettyDate(period.from)} — ${prettyDate(period.to)}`;
  const inputStyle = { background: "#151517", color: "#F2F0EA", border: "1px solid #38383d", borderRadius: 8, padding: "8px 9px", font: "inherit" } as const;

  return (
    <article className="admin-panel admin-operations">
      <div className="admin-panel-head"><span>СВОДКА</span><b>{loading ? "…" : title}</b></div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="admin-secondary" onClick={() => preset(today)}>Сегодня</button>
        <button type="button" className="admin-secondary" onClick={() => preset(yesterday)}>Вчера</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 9 }}>
        <label><small style={{ display: "block", marginBottom: 5 }}>С</small><input type="date" value={from} onChange={(event)=>setFrom(event.target.value)} style={inputStyle} /></label>
        <label><small style={{ display: "block", marginBottom: 5 }}>ПО</small><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} style={inputStyle} /></label>
      </div>
      <button type="button" className="admin-secondary" disabled={loading} onClick={() => void load()} style={{ marginBottom: 12 }}>Показать период</button>
      {error ? <p style={{ color: "#C21F39", margin: "0 0 10px" }}>{error}</p> : null}
      <div className="admin-operation-row"><span>Оплаченные заказы</span><strong>{String(period.newOrders).padStart(2,"0")}</strong></div>
      <div className="admin-operation-row"><span>Новые пользователи</span><strong>{String(period.newUsers).padStart(2,"0")}</strong></div>
      <div className="admin-operation-row"><span>Прошли по билетам</span><strong>{String(period.usedTickets).padStart(2,"0")}</strong></div>
      <div className="admin-operation-row"><span>Ошибки / отмены оплат</span><strong>{String(period.paymentErrors).padStart(2,"0")}</strong></div>
      {canSeeRevenue ? <div className="admin-operation-row"><span>Выручка за период</span><strong>{new Intl.NumberFormat("ru-RU").format(period.revenue)} ₽</strong></div> : null}
    </article>
  );
}
