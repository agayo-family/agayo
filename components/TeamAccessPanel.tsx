"use client";

import { useEffect, useMemo, useState } from "react";
import { ADMIN_PERMISSIONS, AdminPermission, AdminRole, ROLE_DEFAULTS, ROLE_LABELS } from "@/lib/admin-permissions";
import { events } from "@/lib/events";

type CurrentAccess = {
  userId: string;
  agayoId: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  allEvents: boolean;
  eventSlugs: string[];
  bootstrapOwner: boolean;
};

type Member = {
  id: string;
  userId: string;
  agayoId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  allEvents: boolean;
  eventSlugs: string[];
};

const GROUPS = [...new Set(ADMIN_PERMISSIONS.map((permission) => permission.group))];

export default function TeamAccessPanel({ currentAccess }: { currentAccess: CurrentAccess }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [identifierType, setIdentifierType] = useState<"email" | "phone" | "agayoId">("email");
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<AdminRole>("organizer");
  const [permissions, setPermissions] = useState<AdminPermission[]>(ROLE_DEFAULTS.organizer);
  const [allEvents, setAllEvents] = useState(true);
  const [eventSlugs, setEventSlugs] = useState<string[]>([]);

  const publicEvents = useMemo(() => events.filter((event) => event.status === "published"), []);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/team", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить команду");
      setMembers(data.members || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function applyRole(nextRole: AdminRole) {
    setRole(nextRole);
    setPermissions(ROLE_DEFAULTS[nextRole]);
  }

  function togglePermission(permission: AdminPermission) {
    if (role === "owner") return;
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  function toggleEvent(slug: string) {
    setEventSlugs((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  }

  function resetEditor() {
    setEditingId(null); setIdentifierType("email"); setIdentifier(""); applyRole("organizer"); setAllEvents(true); setEventSlugs([]); setError("");
  }

  function edit(member: Member) {
    setEditingId(member.id);
    setIdentifierType("agayoId");
    setIdentifier(member.agayoId);
    setRole(member.role);
    setPermissions(member.permissions);
    setAllEvents(member.allEvents);
    setEventSlugs(member.eventSlugs);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!editingId && identifier.trim().length < 3) { setError("Укажи email, телефон или AGAYO ID"); return; }
    setSaving(true); setError("");
    try {
      const payload = { id: editingId, identifierType, identifier, role, permissions, allEvents, eventSlugs };
      const response = await fetch("/api/admin/team", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить доступ");
      setMembers(data.members || []);
      resetEditor();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка");
    } finally { setSaving(false); }
  }

  async function revoke(member: Member) {
    if (!window.confirm(`Убрать служебный доступ у ${member.agayoId}?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось убрать доступ");
      setMembers(data.members || []);
      if (editingId === member.id) resetEditor();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка"); }
    finally { setSaving(false); }
  }

  return (
    <section className="admin-team-shell">
      <div className="admin-team-intro">
        <span className="admin-kicker">AGAYO ID / РОЛИ / ПРАВА</span>
        <h2>КОМАНДА</h2>
        <p>Название роли задаёт стартовый набор возможностей. Ниже ты можешь отдельно включить или выключить каждую функцию и ограничить сотрудника конкретными мероприятиями.</p>
      </div>

      <div className="admin-current-owner">
        <div><span>ТЕКУЩИЙ ДОСТУП</span><strong>{currentAccess.displayName || currentAccess.email || "AGAYO OWNER"}</strong><small>{currentAccess.agayoId}</small></div>
        <b>{ROLE_LABELS[currentAccess.role]}</b>
      </div>

      <div className="admin-access-editor">
        <div className="admin-access-editor-head">
          <div><span>{editingId ? "РЕДАКТИРОВАНИЕ ДОСТУПА" : "НОВЫЙ УЧАСТНИК"}</span><h3>{editingId ? identifier : "ВЫДАТЬ ДОСТУП"}</h3></div>
          {editingId ? <button type="button" className="admin-secondary" onClick={resetEditor}>Отмена</button> : null}
        </div>

        {!editingId ? (
          <div className="admin-identity-row">
            <select value={identifierType} onChange={(event) => setIdentifierType(event.target.value as typeof identifierType)}>
              <option value="email">Email</option><option value="phone">Телефон</option><option value="agayoId">AGAYO ID</option>
            </select>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={identifierType === "email" ? "person@example.com" : identifierType === "phone" ? "+7 999 000-00-00" : "AGY-XXXXXXXXXX"} />
          </div>
        ) : null}

        <div className="admin-access-section">
          <div className="admin-access-label"><span>01</span><div><b>РОЛЬ</b><small>Выбирает стартовый набор галочек.</small></div></div>
          <div className="admin-role-choice">
            {(["owner", "administrator", "organizer", "controller"] as AdminRole[]).map((item) => (
              <button type="button" key={item} disabled={item === "owner" && currentAccess.role !== "owner"} className={role === item ? "is-active" : ""} onClick={() => applyRole(item)}>
                <b>{ROLE_LABELS[item]}</b><small>{item === "owner" ? "полный доступ" : item === "administrator" ? "управление системой" : item === "organizer" ? "события и контент" : "контроль входа"}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-access-section">
          <div className="admin-access-label"><span>02</span><div><b>ФУНКЦИИ</b><small>Каждая галочка проверяется сервером, а не только скрывает кнопку.</small></div></div>
          <div className="admin-permission-groups">
            {GROUPS.map((group) => (
              <div className="admin-permission-group" key={group}>
                <span>{group}</span>
                {ADMIN_PERMISSIONS.filter((permission) => permission.group === group).map((permission) => (
                  <label key={permission.id} className={permissions.includes(permission.id) ? "is-checked" : ""}>
                    <input type="checkbox" checked={role === "owner" || permissions.includes(permission.id)} disabled={role === "owner"} onChange={() => togglePermission(permission.id)} />
                    <i aria-hidden="true">✓</i><b>{permission.label}</b>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="admin-access-section">
          <div className="admin-access-label"><span>03</span><div><b>МЕРОПРИЯТИЯ</b><small>Можно открыть всю админку только в рамках выбранных событий.</small></div></div>
          <label className="admin-all-events"><input type="checkbox" checked={allEvents} onChange={(event) => setAllEvents(event.target.checked)} /><i>✓</i><div><b>ВСЕ МЕРОПРИЯТИЯ</b><small>Включая новые события, которые появятся позже.</small></div></label>
          {!allEvents ? <div className="admin-event-permissions">
            {publicEvents.map((event) => <label key={event.slug} className={eventSlugs.includes(event.slug) ? "is-checked" : ""}><input type="checkbox" checked={eventSlugs.includes(event.slug)} onChange={() => toggleEvent(event.slug)} /><i>✓</i><div><b>{event.title}</b><small>{event.dateLabel} · {event.timeLabel}</small></div></label>)}
          </div> : null}
        </div>

        {error ? <p className="admin-access-error" role="alert">{error}</p> : null}
        <div className="admin-editor-actions"><button className="admin-primary" type="button" disabled={saving} onClick={save}>{saving ? "СОХРАНЯЕМ…" : editingId ? "СОХРАНИТЬ ПРАВА" : "ВЫДАТЬ ДОСТУП"}</button></div>
      </div>

      <div className="admin-team-list">
        <div className="admin-team-list-head"><span>УЧАСТНИКИ КОМАНДЫ</span><b>{loading ? "…" : String(members.length).padStart(2, "0")}</b></div>
        {loading ? <div className="admin-table-empty"><strong>ЗАГРУЖАЕМ ДОСТУПЫ…</strong></div> : members.length === 0 ? <div className="admin-table-empty"><strong>ПОКА НИКОМУ НЕ ВЫДАНА РОЛЬ</strong><p>Твой OWNER-доступ через AGAYO_OWNER_EMAIL работает отдельно и не исчезнет.</p></div> : members.map((member) => (
          <article className="admin-team-member" key={member.id}>
            <div className="admin-member-person"><span>{member.displayName || member.email || member.phone || "AGAYO USER"}</span><b>{member.agayoId}</b><small>{member.email || member.phone}</small></div>
            <div><span>РОЛЬ</span><b>{ROLE_LABELS[member.role]}</b></div>
            <div><span>ПРАВА</span><b>{member.role === "owner" ? ADMIN_PERMISSIONS.length : member.permissions.length} / {ADMIN_PERMISSIONS.length}</b></div>
            <div><span>СОБЫТИЯ</span><b>{member.allEvents ? "ВСЕ" : member.eventSlugs.length}</b></div>
            <div className="admin-member-actions"><button type="button" onClick={() => edit(member)}>Настроить</button>{member.role !== "owner" ? <button type="button" className="is-danger" onClick={() => void revoke(member)}>Убрать</button> : null}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
