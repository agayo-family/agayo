import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireAdminPermission("view_dashboard");
    const sql = db();
    const eventFilter = access.role === "owner" || access.allEvents ? null : access.eventSlugs;

    const [orderRows, ticketRows, userRows, paymentErrorRows] = await Promise.all([
      eventFilter === null
        ? sql`SELECT COALESCE(SUM(total) FILTER (WHERE status='paid'),0)::int AS revenue, COUNT(*) FILTER (WHERE status='paid' AND created_at >= date_trunc('day', now()))::int AS paid_orders_today FROM orders`
        : eventFilter.length
          ? sql`SELECT COALESCE(SUM(total) FILTER (WHERE status='paid' AND event_slug = ANY(${eventFilter})),0)::int AS revenue, COUNT(*) FILTER (WHERE status='paid' AND event_slug = ANY(${eventFilter}) AND created_at >= date_trunc('day', now()))::int AS paid_orders_today FROM orders`
          : Promise.resolve([{ revenue: 0, paid_orders_today: 0 }]),
      eventFilter === null
        ? sql`SELECT COUNT(*) FILTER (WHERE status='valid')::int AS valid, COUNT(*) FILTER (WHERE status='used')::int AS used, COUNT(*) FILTER (WHERE status IN ('refunded','cancelled'))::int AS invalid FROM tickets`
        : eventFilter.length
          ? sql`SELECT COUNT(*) FILTER (WHERE status='valid' AND event_slug = ANY(${eventFilter}))::int AS valid, COUNT(*) FILTER (WHERE status='used' AND event_slug = ANY(${eventFilter}))::int AS used, COUNT(*) FILTER (WHERE status IN ('refunded','cancelled') AND event_slug = ANY(${eventFilter}))::int AS invalid FROM tickets`
          : Promise.resolve([{ valid: 0, used: 0, invalid: 0 }]),
      sql`SELECT COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today FROM users`,
      eventFilter === null
        ? sql`SELECT COUNT(*) FILTER (WHERE status IN ('cancelled','expired') AND created_at >= date_trunc('day', now()))::int AS today FROM orders`
        : eventFilter.length
          ? sql`SELECT COUNT(*) FILTER (WHERE status IN ('cancelled','expired') AND created_at >= date_trunc('day', now()) AND event_slug = ANY(${eventFilter}))::int AS today FROM orders`
          : Promise.resolve([{ today: 0 }]),
    ]);

    const upcomingRows = await sql`
      SELECT slug,title,starts_at,status,sales_state,age_label
      FROM events
      WHERE status='published' AND starts_at >= now()
      ORDER BY starts_at ASC
      LIMIT 12
    `;
    const upcoming = upcomingRows.find((row) => canAccessEvent(access, String(row.slug))) ?? null;

    return NextResponse.json({
      metrics: {
        revenue: Number(orderRows[0]?.revenue ?? 0),
        sold: Number(ticketRows[0]?.valid ?? 0) + Number(ticketRows[0]?.used ?? 0),
        used: Number(ticketRows[0]?.used ?? 0),
        refunds: Number(ticketRows[0]?.invalid ?? 0),
      },
      today: {
        newOrders: Number(orderRows[0]?.paid_orders_today ?? 0),
        newUsers: Number(userRows[0]?.today ?? 0),
        paymentErrors: Number(paymentErrorRows[0]?.today ?? 0),
      },
      upcoming,
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка обзора" }, { status });
  }
}
