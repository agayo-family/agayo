"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfileEditor({ firstName: initialFirstName, lastName: initialLastName }: { firstName: string; lastName: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить профиль");
      setMessage("Сохранено");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Ошибка");
    } finally { setSaving(false); }
  }

  const inputStyle = {
    width: "100%", background: "#151517", color: "#F2F0EA", border: "1px solid #35353a",
    borderRadius: 10, padding: "13px 14px", font: "inherit", outline: "none",
  } as const;

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 14, padding: "18px 0 22px", borderBottom: "1px solid #2b2b2e" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 7 }}><span style={{ fontSize: 11, letterSpacing: ".12em", color: "#8E8E91" }}>ИМЯ</span><input value={firstName} onChange={(event)=>setFirstName(event.target.value)} maxLength={60} autoComplete="given-name" style={inputStyle} /></label>
        <label style={{ display: "grid", gap: 7 }}><span style={{ fontSize: 11, letterSpacing: ".12em", color: "#8E8E91" }}>ФАМИЛИЯ</span><input value={lastName} onChange={(event)=>setLastName(event.target.value)} maxLength={60} autoComplete="family-name" style={inputStyle} /></label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={{ border: 0, borderRadius: 999, padding: "11px 18px", background: "#F2F0EA", color: "#0B0B0C", font: "inherit", fontWeight: 700, cursor: "pointer" }}>{saving ? "СОХРАНЯЕМ…" : "СОХРАНИТЬ ИМЯ"}</button>
        {message ? <span style={{ fontSize: 12, color: message === "Сохранено" ? "#F2F0EA" : "#C21F39" }}>{message}</span> : null}
      </div>
    </form>
  );
}
