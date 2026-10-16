"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type State = { available: boolean; linked: boolean; preference: "email" | "telegram" };
export default function ProfileTelegram() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/telegram", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось проверить доставку");
      setState(data);
      if (data.linked) setLink("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось проверить доставку"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!link) return;
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    const stopPolling = window.setTimeout(() => window.clearInterval(interval), 2 * 60 * 1000);
    const end = window.setTimeout(() => { window.clearInterval(interval); setLink(""); }, 10 * 60 * 1000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(interval); window.clearTimeout(stopPolling); window.clearTimeout(end); };
  }, [link, refresh]);

  async function change(method: "POST" | "PATCH" | "DELETE", preference?: "email" | "telegram") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile/telegram", { method, headers: { "Content-Type": "application/json" }, ...(preference ? { body: JSON.stringify({ preference }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось изменить доставку");
      if (method === "POST") setLink(data.url);
      else { setState(data); setLink(""); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось изменить доставку"); }
    finally { setBusy(false); }
  }

  return <div className="profile-telegram" aria-labelledby="profile-telegram-title">
    <div className="profile-telegram-heading"><span id="profile-telegram-title">ДОСТАВКА БИЛЕТОВ</span><strong>{state?.preference === "telegram" ? "TELEGRAM" : "EMAIL"}</strong></div>
    <p>Выбери, куда получать новые билеты. Купленные билеты всегда доступны в профиле AGAYO. Коды входа и чеки приходят по email.</p>
    <p>При подключении в твой личный Telegram-чат передаются имя и данные билета, включая QR. <Link href="/legal/privacy">Обработка данных</Link>.</p>
    {state?.available ? <>
      {state.linked ? <div className="profile-telegram-actions">
        <button type="button" disabled={busy || state.preference === "telegram"} onClick={() => void change("PATCH", "telegram")}>Получать в Telegram</button>
        <button type="button" disabled={busy || state.preference === "email"} onClick={() => void change("PATCH", "email")}>Получать по email</button>
        <button type="button" disabled={busy} onClick={() => void change("DELETE")}>Отвязать Telegram</button>
      </div> : <button type="button" disabled={busy} onClick={() => void change("POST")}>{busy ? "Готовим ссылку…" : "Подключить Telegram"}</button>}
      {link ? <div className="profile-telegram-connect"><a href={link} target="_blank" rel="noopener noreferrer">Открыть бота и нажать «Начать» ↗</a><p>Ссылка действует 10 минут. Не пересылай её другим людям. После подключения доставка переключится на Telegram.</p><button type="button" disabled={busy} onClick={() => void refresh()}>Проверить подключение</button></div> : null}
    </> : state ? <p>Telegram ещё подключается. Пока отправляем билеты по email.</p> : <p>Проверяем настройки доставки…</p>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
