"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import AboutContentView from "./AboutContentView";
import { defaultAboutContent, isOrganizerPhotoUrl, parseAboutContent, type AboutContent, type Organizer } from "@/lib/about-content";
import { uploadAdminFile } from "@/lib/client/upload";
import "@/app/about/about.css";
import "./admin-about.css";

type Document = { content: AboutContent; version: number; updatedAt: string | null };
type TextField = "eyebrow" | "title" | "intro" | "description" | "statement" | "teamTitle" | "teamDescription";
const fields: Array<[TextField, string, number, boolean]> = [
  ["eyebrow", "Надпись над заголовком", 100, true], ["title", "Заголовок страницы", 160, true],
  ["intro", "Первый абзац", 3000, true], ["description", "Второй абзац", 3000, false],
  ["statement", "Большая фраза", 300, true], ["teamTitle", "Заголовок команды", 160, true],
  ["teamDescription", "Вступление к команде", 1000, false],
];

export default function AdminAboutManager({ previewMode = false }: { previewMode?: boolean }) {
  const [document, setDocument] = useState<Document | null>(() => previewMode ? { content: structuredClone(defaultAboutContent), version: 0, updatedAt: null } : null);
  const [savedContent, setSavedContent] = useState(() => previewMode ? JSON.stringify(defaultAboutContent) : "");
  const [loading, setLoading] = useState(!previewMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [removed, setRemoved] = useState<{ person: Organizer; index: number } | null>(null);
  const dirty = Boolean(document && JSON.stringify(document.content) !== savedContent);

  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    fetch("/api/admin/about", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить страницу");
      setDocument(data); setSavedContent(JSON.stringify(data.content));
    }).catch((error) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Ошибка загрузки"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [previewMode, loadAttempt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(field: TextField | "tags", value: string | string[]) {
    setDocument((current) => current ? { ...current, content: { ...current.content, [field]: value } } : current);
    setMessage("");
  }
  function changePerson(id: string, patch: Partial<Organizer>) {
    setDocument((current) => current ? { ...current, content: { ...current.content, organizers: current.content.organizers.map((person) => person.id === id ? { ...person, ...patch } : person) } } : current);
    setMessage("");
  }
  function addPerson() {
    const person: Organizer = { id: crypto.randomUUID(), name: "", role: "", description: "", photoUrl: "", photoAlt: "", visible: true };
    setDocument((current) => current ? { ...current, content: { ...current.content, organizers: [...current.content.organizers, person] } } : current);
    setMessage("");
  }
  function movePerson(index: number, direction: number) {
    setDocument((current) => {
      if (!current) return current;
      const people = [...current.content.organizers];
      const target = index + direction;
      if (target < 0 || target >= people.length) return current;
      [people[index], people[target]] = [people[target], people[index]];
      return { ...current, content: { ...current.content, organizers: people } };
    });
    setMessage("");
  }
  function removePerson(person: Organizer, index: number) {
    setRemoved({ person, index });
    setDocument((current) => current ? { ...current, content: { ...current.content, organizers: current.content.organizers.filter((item) => item.id !== person.id) } } : current);
    setMessage("");
  }
  function undoRemove() {
    if (!removed) return;
    setDocument((current) => {
      if (!current) return current;
      const organizers = [...current.content.organizers];
      organizers.splice(removed.index, 0, removed.person);
      return { ...current, content: { ...current.content, organizers } };
    });
    setRemoved(null);
  }

  async function uploadPortrait(personId: string, file: File) {
    if (previewMode) { setMessage("В предпросмотре загрузка отключена. Фотографии загружаются в настоящей админке."); return; }
    setBusy(true); setMessage("Загружаем фотографию…");
    try {
      const blob = await uploadAdminFile(file, "organizer");
      changePerson(personId, { photoUrl: blob.url });
      setMessage("Фотография загружена. Нажми «Сохранить страницу», чтобы опубликовать её.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить фотографию"); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!document || busy) return;
    setBusy(true); setMessage("");
    try {
      const content = parseAboutContent(document.content);
      if (previewMode) { setDocument({ ...document, content }); setSavedContent(JSON.stringify(content)); setMessage("Предпросмотр сохранён в этой вкладке. Публичная страница не изменена."); return; }
      const response = await fetch("/api/admin/about", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, version: document.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить страницу");
      setDocument(data); setSavedContent(JSON.stringify(data.content)); setRemoved(null);
      setMessage("Страница опубликована. Изменения уже доступны в разделе «О нас».");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить страницу"); }
    finally { setBusy(false); }
  }

  if (loading) return <p role="status">Загружаем страницу «О нас»…</p>;
  if (loadError || !document) return <div role="alert"><p>{loadError || "Страница недоступна"}</p><button className="admin-secondary" onClick={() => setLoadAttempt((value) => value + 1)}>Попробовать ещё раз</button></div>;
  const content = document.content;
  return <div className="admin-about-manager">
    <div className="admin-about-header"><div><span className="admin-kicker">ПУБЛИЧНАЯ СТРАНИЦА</span><h2>О НАС</h2><p>Тексты и карточки команды. Правки появятся на сайте после сохранения.</p></div><a href="/about" target="_blank" rel="noopener noreferrer" className="admin-secondary admin-button-link">Открыть страницу ↗</a></div>
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="admin-about-fields">
        <div className="admin-about-copy-fields">{fields.map(([key, label, max, required]) => <label key={key}><span>{label}</span><textarea value={content[key]} onChange={(event) => change(key, event.target.value)} maxLength={max} required={required} rows={key === "intro" || key === "description" ? 4 : 2} /></label>)}</div>
        <label><span>Метки — по одной на строку, до 6</span><textarea value={content.tags.join("\n")} onChange={(event) => change("tags", event.target.value.split("\n"))} rows={3} /></label>
        <div className="admin-about-team-title"><div><h3>Организаторы</h3><p>Карточки выводятся в этом порядке. Скрытые карточки видны только в редакторе.</p></div><button type="button" className="admin-secondary" onClick={addPerson} disabled={content.organizers.length >= 24}>Добавить организатора +</button></div>
        <div className="admin-about-people">{content.organizers.map((person, index) => <article className="admin-about-person" key={person.id}>
          <div className="admin-about-person-photo">{person.photoUrl ? <Image src={person.photoUrl} alt={person.photoAlt || person.name || "Фотография организатора"} fill sizes="(max-width: 700px) 80vw, 190px" /> : <span>ФОТО ОРГАНИЗАТОРА</span>}</div>
          <div className="admin-about-person-fields">
            <div className="admin-about-person-top"><b>Карточка {String(index + 1).padStart(2, "0")}</b><label className="admin-about-visible"><input type="checkbox" checked={person.visible} onChange={(event) => changePerson(person.id, { visible: event.target.checked })} /><span>Показывать на сайте</span></label></div>
            <label><span>Имя</span><input required maxLength={100} value={person.name} onChange={(event) => changePerson(person.id, { name: event.target.value })} /></label>
            <label><span>Роль в команде</span><input maxLength={120} placeholder="Например: организация событий" value={person.role} onChange={(event) => changePerson(person.id, { role: event.target.value })} /></label>
            <label><span>Описание</span><textarea maxLength={1600} rows={4} value={person.description} onChange={(event) => changePerson(person.id, { description: event.target.value })} /></label>
            <label className="admin-about-upload"><span>Загрузить фото · JPG, PNG, WEBP, AVIF · до 8 МБ</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPortrait(person.id, file); event.target.value = ""; }} /></label>
            <label><span>Ссылка на фотографию</span><input key={person.photoUrl} type="text" maxLength={2000} defaultValue={person.photoUrl} onBlur={(event) => { const url = event.target.value.trim(); if (isOrganizerPhotoUrl(url)) changePerson(person.id, { photoUrl: url }); else { event.target.value = person.photoUrl; setMessage("Используй ссылку Vercel Blob или загрузи фото кнопкой выше."); } }} placeholder="Или вставь готовую ссылку Vercel Blob" /></label>
            <label><span>Описание фотографии для доступности</span><input maxLength={200} value={person.photoAlt} onChange={(event) => changePerson(person.id, { photoAlt: event.target.value })} /></label>
            <div className="admin-about-person-actions"><button className="admin-secondary" type="button" disabled={index === 0} onClick={() => movePerson(index, -1)}>Выше ↑</button><button className="admin-secondary" type="button" disabled={index === content.organizers.length - 1} onClick={() => movePerson(index, 1)}>Ниже ↓</button>{person.photoUrl && <button className="admin-secondary" type="button" onClick={() => changePerson(person.id, { photoUrl: "", photoAlt: "" })}>Убрать фото</button>}<button className="admin-secondary" type="button" onClick={() => removePerson(person, index)}>Убрать карточку</button></div>
          </div>
        </article>)}</div>
        {removed && <div className="admin-about-undo"><span>Карточка убрана из страницы.</span><button type="button" className="admin-secondary" onClick={undoRemove}>Вернуть карточку</button></div>}
      </fieldset>
      <div className="admin-about-save"><span>{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span><button type="button" className="admin-secondary" onClick={() => setShowPreview((value) => !value)}>{showPreview ? "Скрыть предпросмотр" : "Предпросмотр страницы"}</button><button className="admin-primary" type="submit" disabled={busy || !dirty}>{busy ? "СОХРАНЯЕМ…" : "Сохранить страницу"}</button></div>
      {message && <p className="admin-about-message" role="status">{message}</p>}
    </form>
    {showPreview && <div className="admin-about-preview about-page"><div className="admin-about-preview-label">ПРЕДПРОСМОТР · НЕСОХРАНЁННЫЕ ПРАВКИ</div><AboutContentView content={content} /></div>}
  </div>;
}
