import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireAdminPermission("manual_ticket_search");
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ tickets: [] });
    const term = `%${q}%`;
    const sql = db();
    const rows = await sql`
      SELECT t.id,t.public_id,t.event_slug,t.owner_name,t.category_name,t.status,t.zone,t.seat,t.used_at,t.created_at,
             u.email,u.phone,u.agayo_id
      FROM tickets t
      JOIN users u ON u.id=t.user_id
      WHERE t.public_id ILIKE ${term} OR t.owner_name ILIKE ${term} OR COALESCE(u.email,'') ILIKE ${term} OR COALESCE(u.phone,'') ILIKE ${term} OR COALESCE(u.agayo_id,'') ILIKE ${term}
      ORDER BY t.created_at DESC LIMIT 50
    `;
    return NextResponse.json({ tickets: rows.filter((row) => canAccessEvent(access, String(row.event_slug))) });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка поиска" }, { status });
  }
}
