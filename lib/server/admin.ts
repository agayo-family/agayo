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
    SELECT am.id, am.role, am.permissions, am.all_events
    FROM admin_memberships am
    WHERE am.user_id=${user.id} AND am.active=true
    LIMIT 1
  `;
  const membership = rows[0];
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
