import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireAdminPermission("manual_ticket_search");
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 160) ?? "";
    const sql = db();

    const rows = q
      ? await sql`
          SELECT
            t.id,t.public_id,t.event_slug,t.owner_name,t.category_name,t.status,t.zone,t.seat,t.used_at,t.created_at,
            u.email,u.phone,u.agayo_id,
            o.public_id AS order_public_id,o.status AS order_status,o.total,o.refunded_amount,o.yookassa_payment_id,o.paid_at,
            (SELECT COUNT(*)::int FROM tickets t2 WHERE t2.order_id=t.order_id) AS order_ticket_count
          FROM tickets t
          JOIN users u ON u.id=t.user_id
          JOIN orders o ON o.id=t.order_id
          WHERE
            t.public_id ILIKE ${`%${q}%`} OR
            t.owner_name ILIKE ${`%${q}%`} OR
            o.public_id ILIKE ${`%${q}%`} OR
            COALESCE(u.email,'') ILIKE ${`%${q}%`} OR
            COALESCE(u.phone,'') ILIKE ${`%${q}%`} OR
            COALESCE(u.agayo_id,'') ILIKE ${`%${q}%`} OR
            t.event_slug ILIKE ${`%${q}%`}
          ORDER BY t.created_at DESC
        `
      : await sql`
          SELECT
            t.id,t.public_id,t.event_slug,t.owner_name,t.category_name,t.status,t.zone,t.seat,t.used_at,t.created_at,
            u.email,u.phone,u.agayo_id,
            o.public_id AS order_public_id,o.status AS order_status,o.total,o.refunded_amount,o.yookassa_payment_id,o.paid_at,
            (SELECT COUNT(*)::int FROM tickets t2 WHERE t2.order_id=t.order_id) AS order_ticket_count
          FROM tickets t
          JOIN users u ON u.id=t.user_id
          JOIN orders o ON o.id=t.order_id
          ORDER BY t.created_at DESC
        `;

    const canRefund = access.role === "owner" || access.permissions.includes("view_revenue");
    const tickets = rows
      .filter((row) => canAccessEvent(access, String(row.event_slug)))
      .map((row) => canRefund ? row : { ...row, total: 0, refunded_amount: 0, yookassa_payment_id: null });
    return NextResponse.json({
      tickets,
      permissions: {
        canManageTickets: access.role === "owner" || access.permissions.includes("manage_ticket_inventory"),
        canRefund,
      },
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка загрузки билетов" }, { status });
  }
}
