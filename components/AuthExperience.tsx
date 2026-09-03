"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthExperience() {
  const router = useRouter();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось отправить код");
      setCodeSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, value, code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось войти");
      router.push("/profile"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button type="button" className={method === "email" ? "is-active" : ""} onClick={() => { setMethod("email"); setCodeSent(false); setCode(""); setError(""); }}>EMAIL</button>
        <button type="button" className={method === "phone" ? "is-active" : ""} onClick={() => { setMethod("phone"); setCodeSent(false); setCode(""); setError(""); }}>ТЕЛЕФОН</button>
      </div>
      <h1>ВХОД<br />БЕЗ ПАРОЛЯ</h1>
      <p>Укажи {method === "email" ? "почту" : "номер телефона"}. Мы отправим одноразовый код и откроем твой AGAYO ID.</p>
      <label className="auth-field"><span>{method === "email" ? "EMAIL" : "ТЕЛЕФОН"}</span><input type={method === "email" ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={method === "email" ? "you@example.com" : "+7 999 000-00-00"} /></label>
      {!codeSent ? (
        <button type="button" className="auth-main-button" onClick={requestCode} disabled={busy || value.trim().length < 5}>{busy ? "ОТПРАВЛЯЕМ…" : "ПОЛУЧИТЬ КОД"}</button>
      ) : (
        <>
          <label className="auth-field"><span>КОД ИЗ СООБЩЕНИЯ</span><input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} /></label>
          <button type="button" className="auth-main-button" onClick={verifyCode} disabled={busy || code.length !== 6}>{busy ? "ПРОВЕРЯЕМ…" : "ВОЙТИ В AGAYO ID"}</button>
          <button type="button" className="auth-resend-button" onClick={requestCode} disabled={busy}>Отправить код ещё раз</button>
        </>
      )}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {method === "phone" ? <small>Вход по телефону уже предусмотрен архитектурой, но для отправки SMS нужно подключить SMS-провайдера.</small> : null}
      <div className="auth-rule">НЕТ АККАУНТА? ОН СОЗДАСТСЯ АВТОМАТИЧЕСКИ ПОСЛЕ ПЕРВОЙ ПОКУПКИ ИЛИ ВХОДА.</div>
    </div>
  );
}
