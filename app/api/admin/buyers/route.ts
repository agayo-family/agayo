import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireAdminPermission("view_buyers");
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const sql = db();
    const permitted = access.role === "owner" || access.allEvents ? null : access.eventSlugs;
    const term = `%${q}%`;
    const rows = q.length >= 2
      ? await sql`
          SELECT u.id,u.agayo_id,u.display_name,u.email,u.phone,u.loyalty_level,u.created_at,
                 COUNT(t.id)::int AS tickets,
                 COUNT(t.id) FILTER (WHERE t.status='used')::int AS visits
          FROM users u LEFT JOIN tickets t ON t.user_id=u.id
          WHERE COALESCE(u.display_name,'') ILIKE ${term} OR COALESCE(u.email,'') ILIKE ${term} OR COALESCE(u.phone,'') ILIKE ${term} OR COALESCE(u.agayo_id,'') ILIKE ${term}
          GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50
        `
      : await sql`
          SELECT u.id,u.agayo_id,u.display_name,u.email,u.phone,u.loyalty_level,u.created_at,
                 COUNT(t.id)::int AS tickets,
                 COUNT(t.id) FILTER (WHERE t.status='used')::int AS visits
          FROM users u LEFT JOIN tickets t ON t.user_id=u.id
          GROUP BY u.id ORDER BY u.created_at DESC LIMIT 30
        `;

    if (permitted === null) return NextResponse.json({ buyers: rows });
    if (!permitted.length) return NextResponse.json({ buyers: [] });
    const allowedUsers = await sql`SELECT DISTINCT user_id FROM tickets WHERE event_slug = ANY(${permitted})`;
    const ids = new Set(allowedUsers.map((row) => String(row.user_id)));
    return NextResponse.json({ buyers: rows.filter((row) => ids.has(String(row.id))) });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка поиска" }, { status });
  }
}
