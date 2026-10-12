import { getCurrentUser } from "./auth";
import { db } from "./db";
import { normalizeEmail } from "./security";
import { ADMIN_PERMISSIONS, AdminPermission, AdminRole, isAdminPermission } from "../admin-permissions";

export type AdminAccess = {
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

export function hasPermission(access: AdminAccess, permission: AdminPermission) {
  return access.role === "owner" || access.permissions.includes(permission);
}

export function canAccessEvent(access: AdminAccess, eventSlug?: string | null) {
  if (!eventSlug || access.role === "owner" || access.allEvents) return true;
  return access.eventSlugs.includes(eventSlug);
}

// Versioned upgrade for previously fully privileged administrators saved before About had its own permission.
// Keep this list fixed: future permissions must not broaden this migration.
const LEGACY_FULL_ADMINISTRATOR_PERMISSIONS_V1 = [
  "view_dashboard", "manage_events", "publish_events", "manage_ticket_inventory",
  "view_buyers", "view_revenue", "view_statistics", "scan_tickets",
  "manual_ticket_search", "manage_promos", "manage_media", "manage_loyalty", "manage_team",
] as const;
// Conservative boundary: the earliest locally available snapshot, 2e9f98d,
// already defines manage_about (committer 2026-10-11T21:16:14+03:00).
// Earlier Git history is unavailable; a later rollout date must not broaden eligibility.
const LEGACY_FULL_ADMINISTRATOR_CUTOFF_AT = Date.parse("2026-10-11T18:16:14.000Z");
const ABOUT_PERMISSION_UPGRADE_ACTION = "admin.permissions.about.v1";

function isLegacyFullAdministrator(membership: Record<string, any>) {
  const permissions = membership.permissions;
  return membership.role === "administrator" && membership.all_events === true
    && Array.isArray(permissions) && permissions.length === LEGACY_FULL_ADMINISTRATOR_PERMISSIONS_V1.length
    && new Set(permissions).size === permissions.length
    && LEGACY_FULL_ADMINISTRATOR_PERMISSIONS_V1.every(permission => permissions.includes(permission))
    && Date.parse(String(membership.created_at)) < LEGACY_FULL_ADMINISTRATOR_CUTOFF_AT
    && Date.parse(String(membership.updated_at)) < LEGACY_FULL_ADMINISTRATOR_CUTOFF_AT;
}

export async function upgradeLegacyAdministratorAboutPermission(sql: ReturnType<typeof db>, membership: Record<string, any>, actorUserId: string): Promise<Record<string, any> | null> {
  if (!isLegacyFullAdministrator(membership)) return membership;
  return sql.begin(async tx => {
    const [current] = await tx`SELECT id, role, permissions, all_events, active, created_at, updated_at
      FROM admin_memberships WHERE id=${membership.id} FOR UPDATE`;
    if (!current || !current.active) return null;
    if (!isLegacyFullAdministrator(current)) return current;
    const [completed] = await tx`SELECT id FROM admin_audit_log
      WHERE action=${ABOUT_PERMISSION_UPGRADE_ACTION} AND target_type='admin_membership' AND target_id=${String(current.id)} LIMIT 1`;
    if (completed) return current;
    const permissions = [...current.permissions, "manage_about"];
    const [updated] = await tx`UPDATE admin_memberships SET permissions=${JSON.stringify(permissions)}::jsonb, updated_at=now()
      WHERE id=${current.id} RETURNING id, role, permissions, all_events, active, created_at, updated_at`;
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorUserId},${ABOUT_PERMISSION_UPGRADE_ACTION},'admin_membership',${String(current.id)},
        ${JSON.stringify({ version: 1, permission: "manage_about", previousPermissions: current.permissions })}::jsonb)`;
    return updated;
  });
}

export async function getCurrentAdminAccess(): Promise<AdminAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const ownerEmail = normalizeEmail(process.env.AGAYO_OWNER_EMAIL ?? "");
  if (ownerEmail && user.email && normalizeEmail(String(user.email)) === ownerEmail) {
    return {
      userId: String(user.id),
      agayoId: String(user.agayo_id ?? "OWNER"),
      email: String(user.email),
      displayName: user.display_name ? String(user.display_name) : null,
      role: "owner",
      permissions: ADMIN_PERMISSIONS.map((item) => item.id),
      allEvents: true,
      eventSlugs: [],
      bootstrapOwner: true,
    };
  }

  const sql = db();
  const rows = await sql`
    SELECT am.id, am.role, am.permissions, am.all_events, am.created_at, am.updated_at
    FROM admin_memberships am
    WHERE am.user_id=${user.id} AND am.active=true
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const membership = await upgradeLegacyAdministratorAboutPermission(sql, rows[0], String(user.id));
  if (!membership) return null;

  const rawPermissions = Array.isArray(membership.permissions) ? membership.permissions : [];
  const permissions = rawPermissions.map(String).filter(isAdminPermission);
  const eventRows = membership.all_events
    ? []
    : await sql`SELECT event_slug FROM admin_event_access WHERE membership_id=${membership.id} ORDER BY event_slug`;

  return {
    userId: String(user.id),
    agayoId: String(user.agayo_id),
    email: user.email ? String(user.email) : null,
    displayName: user.display_name ? String(user.display_name) : null,
    role: String(membership.role) as AdminRole,
    permissions,
    allEvents: Boolean(membership.all_events),
    eventSlugs: eventRows.map((row) => String(row.event_slug)),
    bootstrapOwner: false,
  };
}

export class AdminAccessError extends Error {
  status: number;
  constructor(message = "Доступ запрещён", status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireAdminPermission(permission: AdminPermission, eventSlug?: string | null) {
  const access = await getCurrentAdminAccess();
  if (!access) throw new AdminAccessError("Требуется служебный доступ", 403);
  if (!hasPermission(access, permission)) throw new AdminAccessError("Недостаточно прав", 403);
  if (!canAccessEvent(access, eventSlug)) throw new AdminAccessError("Нет доступа к этому мероприятию", 403);
  return access;
}

export async function writeAdminAudit(actorUserId: string, action: string, targetType?: string, targetId?: string, details: Record<string, unknown> = {}) {
  const sql = db();
  await sql`
    INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
    VALUES(${actorUserId},${action},${targetType ?? null},${targetId ?? null},${JSON.stringify(details)}::jsonb)
  `;
}
