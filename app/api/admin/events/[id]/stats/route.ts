import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, hasPermission, requireAdminPermission } from "@/lib/server/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = db();
    const rows = await sql`SELECT id,slug,title,starts_at,sales_state,status FROM events WHERE id=${id} LIMIT 1`;
    const event = rows[0];
    if (!event) return NextResponse.json({ error: "Мероприятие не найдено" }, { status: 404 });
    const access = await requireAdminPermission("view_statistics", String(event.slug));

    const [orders] = await sql`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE status='paid'),0)::int AS revenue,
        COUNT(*) FILTER (WHERE status='paid')::int AS paid_orders,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending_orders,
        COUNT(*) FILTER (WHERE status IN ('refunded','cancelled','expired'))::int AS failed_orders,
        COALESCE(SUM(discount) FILTER (WHERE status='paid'),0)::int AS discounts
      FROM orders WHERE event_slug=${event.slug}
    `;
    const [tickets] = await sql`
      SELECT COUNT(*)::int AS issued,
        COUNT(*) FILTER (WHERE status='used')::int AS used,
        COUNT(*) FILTER (WHERE status='valid')::int AS valid,
        COUNT(*) FILTER (WHERE status IN ('refunded','cancelled'))::int AS invalid
      FROM tickets WHERE event_slug=${event.slug}
    `;
    const categories = await sql`
      SELECT c.category_key,c.name,c.price,c.inventory,c.hot_enabled,
        COALESCE(COUNT(t.id) FILTER (WHERE t.status IN ('valid','used')),0)::int AS sold,
        COALESCE(COUNT(t.id) FILTER (WHERE t.status='used'),0)::int AS used
      FROM event_ticket_categories c
      LEFT JOIN tickets t ON t.event_slug=${event.slug} AND t.category_id=c.category_key
      WHERE c.event_id=${id}
      GROUP BY c.id,c.category_key,c.name,c.price,c.inventory,c.hot_enabled,c.sort_order
      ORDER BY c.sort_order,c.name
    `;
    const promo = await sql`
      SELECT promo_code,COUNT(*)::int AS orders,COALESCE(SUM(discount),0)::int AS discount
      FROM orders WHERE event_slug=${event.slug} AND status='paid' AND promo_code IS NOT NULL
      GROUP BY promo_code ORDER BY orders DESC LIMIT 8
    `;
    const financials = hasPermission(access, "view_revenue") ? orders : { ...orders, revenue: 0, discounts: 0 };
    return NextResponse.json({ event, canViewRevenue: hasPermission(access, "view_revenue"), metrics: { ...financials, ...tickets }, categories, promo: hasPermission(access, "view_revenue") ? promo : [] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить статистику" }, { status });
  }
}
