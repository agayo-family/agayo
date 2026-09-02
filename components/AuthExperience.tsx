"use client";

import { useState } from "react";

export default function AuthExperience() {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button type="button" className={method === "email" ? "is-active" : ""} onClick={() => { setMethod("email"); setCodeSent(false); }}>EMAIL</button>
        <button type="button" className={method === "phone" ? "is-active" : ""} onClick={() => { setMethod("phone"); setCodeSent(false); }}>ТЕЛЕФОН</button>
      </div>
      <h1>ВХОД<br />БЕЗ ПАРОЛЯ</h1>
      <p>Укажи {method === "email" ? "почту" : "номер телефона"}. В рабочей версии мы отправим одноразовый код и сразу откроем твой AGAYO ID.</p>
      <label className="auth-field"><span>{method === "email" ? "EMAIL" : "ТЕЛЕФОН"}</span><input type={method === "email" ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={method === "email" ? "you@example.com" : "+7 999 000-00-00"} /></label>
      {!codeSent ? <button type="button" className="auth-main-button" onClick={() => setCodeSent(true)} disabled={value.trim().length < 5}>ПОЛУЧИТЬ КОД</button> : <><label className="auth-field"><span>КОД ИЗ СООБЩЕНИЯ</span><input inputMode="numeric" placeholder="000000" maxLength={6} /></label><button type="button" className="auth-main-button" disabled>ВОЙТИ В AGAYO ID</button><small>Отправка кода подключится на backend-этапе. Сейчас это интерфейс будущей авторизации.</small></>}
      <div className="auth-rule">НЕТ АККАУНТА? ОН СОЗДАСТСЯ АВТОМАТИЧЕСКИ ПОСЛЕ ПЕРВОЙ ПОКУПКИ ИЛИ ВХОДА.</div>
    </div>
  );
}
