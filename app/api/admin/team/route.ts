import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { AdminRole, ROLE_DEFAULTS, isAdminPermission } from "@/lib/admin-permissions";
import { normalizeEmail, normalizePhone } from "@/lib/server/security";

const ROLES: AdminRole[] = ["owner", "administrator", "organizer", "controller"];

function cleanRole(value: unknown): AdminRole {
  const role = String(value ?? "organizer") as AdminRole;
  return ROLES.includes(role) ? role : "organizer";
}

function cleanPermissions(value: unknown, role: AdminRole) {
  if (!Array.isArray(value)) return ROLE_DEFAULTS[role];
  return value.map(String).filter(isAdminPermission);
}

function cleanEvents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 100);
}


function assertCanGrant(actor: Awaited<ReturnType<typeof requireAdminPermission>>, permissions: ReturnType<typeof cleanPermissions>, allEvents: boolean, eventSlugs: string[]) {
  if (actor.role === "owner") return;
  const forbidden = permissions.filter((permission) => !actor.permissions.includes(permission));
  if (forbidden.length) throw new AdminAccessError("Нельзя выдать права, которых нет у тебя", 403);
  if (allEvents && !actor.allEvents) throw new AdminAccessError("Нельзя выдать доступ ко всем мероприятиям", 403);
  if (!allEvents && !actor.allEvents && eventSlugs.some((slug) => !actor.eventSlugs.includes(slug))) {
    throw new AdminAccessError("Нельзя выдать доступ к чужому мероприятию", 403);
  }
}

async function listTeam() {
  const sql = db();
  const rows = await sql`
    SELECT am.id, am.role, am.permissions, am.all_events, am.active, am.created_at, am.updated_at,
           u.id AS user_id, u.agayo_id, u.email, u.phone, u.display_name
    FROM admin_memberships am
    JOIN users u ON u.id=am.user_id
    WHERE am.active=true
    ORDER BY CASE am.role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 WHEN 'organizer' THEN 2 ELSE 3 END, am.created_at
  `;
  const scopes = await sql`
    SELECT membership_id, event_slug
    FROM admin_event_access
    WHERE membership_id IN (SELECT id FROM admin_memberships WHERE active=true)
    ORDER BY event_slug
  `;
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    agayoId: String(row.agayo_id),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    role: String(row.role),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    allEvents: Boolean(row.all_events),
    eventSlugs: scopes.filter((scope) => String(scope.membership_id) === String(row.id)).map((scope) => String(scope.event_slug)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function GET() {
  try {
    await requireAdminPermission("manage_team");
    return NextResponse.json({ members: await listTeam() });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminPermission("manage_team");
    const body = await request.json();
    const identifierType = body.identifierType === "agayoId" || body.identifierType === "phone" ? body.identifierType : "email";
    const rawIdentifier = String(body.identifier ?? "").trim();
    const role = cleanRole(body.role);
    if (role === "owner" && actor.role !== "owner") throw new AdminAccessError("Только OWNER может назначить OWNER", 403);
    const permissions = role === "owner" ? ROLE_DEFAULTS.owner : cleanPermissions(body.permissions, role);
    const allEvents = body.allEvents !== false;
    const eventSlugs = allEvents ? [] : cleanEvents(body.eventSlugs);
    assertCanGrant(actor, permissions, allEvents, eventSlugs);
    const sql = db();

    let users;
    if (identifierType === "agayoId") {
      users = await sql`SELECT * FROM users WHERE upper(agayo_id)=upper(${rawIdentifier}) LIMIT 1`;
    } else if (identifierType === "phone") {
      const phone = normalizePhone(rawIdentifier);
      users = await sql`SELECT * FROM users WHERE phone=${phone} LIMIT 1`;
      if (!users[0] && phone.length >= 6) users = await sql`INSERT INTO users(phone) VALUES(${phone}) RETURNING *`;
    } else {
      const email = normalizeEmail(rawIdentifier);
      if (!email.includes("@")) return NextResponse.json({ error: "Укажи корректный email" }, { status: 400 });
      users = await sql`SELECT * FROM users WHERE email=${email} LIMIT 1`;
      if (!users[0]) users = await sql`INSERT INTO users(email) VALUES(${email}) RETURNING *`;
    }
    const user = users[0];
    if (!user) return NextResponse.json({ error: "AGAYO ID не найден" }, { status: 404 });

    const existing = await sql`SELECT id FROM admin_memberships WHERE user_id=${user.id} LIMIT 1`;
    let membershipId: string;
    if (existing[0]) {
      membershipId = String(existing[0].id);
      await sql`
        UPDATE admin_memberships
        SET role=${role}, permissions=${JSON.stringify(permissions)}::jsonb, all_events=${allEvents}, active=true, updated_at=now()
        WHERE id=${membershipId}
      `;
      await sql`DELETE FROM admin_event_access WHERE membership_id=${membershipId}`;
    } else {
      const inserted = await sql`
        INSERT INTO admin_memberships(user_id,role,permissions,all_events,created_by)
        VALUES(${user.id},${role},${JSON.stringify(permissions)}::jsonb,${allEvents},${actor.userId})
        RETURNING id
      `;
      membershipId = String(inserted[0].id);
    }
    for (const slug of eventSlugs) await sql`INSERT INTO admin_event_access(membership_id,event_slug) VALUES(${membershipId},${slug}) ON CONFLICT DO NOTHING`;
    await writeAdminAudit(actor.userId, "team.member.upsert", "admin_membership", membershipId, { agayoId: user.agayo_id, role, permissions, allEvents, eventSlugs });
    return NextResponse.json({ ok: true, members: await listTeam() });
  } catch (error) {
    console.error(error);
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить доступ" }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminPermission("manage_team");
    const body = await request.json();
    const membershipId = String(body.id ?? "");
    const role = cleanRole(body.role);
    if (!membershipId) return NextResponse.json({ error: "Не указан участник" }, { status: 400 });
    if (role === "owner" && actor.role !== "owner") throw new AdminAccessError("Только OWNER может назначить OWNER", 403);
    const permissions = role === "owner" ? ROLE_DEFAULTS.owner : cleanPermissions(body.permissions, role);
    const allEvents = body.allEvents !== false;
    const eventSlugs = allEvents ? [] : cleanEvents(body.eventSlugs);
    assertCanGrant(actor, permissions, allEvents, eventSlugs);
    const sql = db();
    const target = await sql`SELECT am.id, am.role, am.user_id FROM admin_memberships am WHERE am.id=${membershipId} AND am.active=true LIMIT 1`;
    if (!target[0]) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    if (target[0].role === "owner" && actor.role !== "owner") throw new AdminAccessError("Нельзя изменить OWNER", 403);
    if (String(target[0].user_id) === actor.userId && actor.role === "owner" && role !== "owner") throw new AdminAccessError("OWNER не может снять собственный доступ", 400);

    await sql`UPDATE admin_memberships SET role=${role},permissions=${JSON.stringify(permissions)}::jsonb,all_events=${allEvents},updated_at=now() WHERE id=${membershipId}`;
    await sql`DELETE FROM admin_event_access WHERE membership_id=${membershipId}`;
    for (const slug of eventSlugs) await sql`INSERT INTO admin_event_access(membership_id,event_slug) VALUES(${membershipId},${slug}) ON CONFLICT DO NOTHING`;
    await writeAdminAudit(actor.userId, "team.member.update", "admin_membership", membershipId, { role, permissions, allEvents, eventSlugs });
    return NextResponse.json({ ok: true, members: await listTeam() });
  } catch (error) {
    console.error(error);
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить доступ" }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdminPermission("manage_team");
    const body = await request.json();
    const membershipId = String(body.id ?? "");
    const sql = db();
    const target = await sql`SELECT id,role,user_id FROM admin_memberships WHERE id=${membershipId} AND active=true LIMIT 1`;
    if (!target[0]) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    if (target[0].role === "owner") throw new AdminAccessError("OWNER нельзя удалить через этот экран", 400);
    if (String(target[0].user_id) === actor.userId) throw new AdminAccessError("Нельзя удалить собственный доступ", 400);
    await sql`UPDATE admin_memberships SET active=false,updated_at=now() WHERE id=${membershipId}`;
    await writeAdminAudit(actor.userId, "team.member.revoke", "admin_membership", membershipId);
    return NextResponse.json({ ok: true, members: await listTeam() });
  } catch (error) {
    console.error(error);
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось убрать доступ" }, { status });
  }
}
