import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, hasPermission, requireAdminPermission } from "@/lib/server/admin";
import { ensureSeedEvents } from "@/lib/server/seed-events";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function moscowDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function cleanRange(request: Request) {
  const url = new URL(request.url);
  let from = url.searchParams.get("from") || moscowDate();
  let to = url.searchParams.get("to") || from;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new AdminAccessError("Некорректная дата", 400);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export async function GET(request: Request) {
  try {
    const access = await requireAdminPermission("view_dashboard");
    const { from, to } = cleanRange(request);
    await ensureSeedEvents();
    const sql = db();
    const eventFilter = access.role === "owner" || access.allEvents ? null : access.eventSlugs;
    const canSeeRevenue = hasPermission(access, "view_revenue");

    const [orderRows, ticketRows, periodOrderRows, periodUserRows, periodTicketRows] = await Promise.all([
      eventFilter === null
        ? sql`SELECT COALESCE(SUM(total) FILTER (WHERE status='paid'),0)::int AS revenue FROM orders`
        : eventFilter.length
          ? sql`SELECT COALESCE(SUM(total) FILTER (WHERE status='paid' AND event_slug = ANY(${eventFilter})),0)::int AS revenue FROM orders`
          : Promise.resolve([{ revenue: 0 }]),
      eventFilter === null
        ? sql`SELECT COUNT(*) FILTER (WHERE status='valid')::int AS valid, COUNT(*) FILTER (WHERE status='used')::int AS used, COUNT(*) FILTER (WHERE status IN ('refunded','cancelled'))::int AS invalid FROM tickets`
        : eventFilter.length
          ? sql`SELECT COUNT(*) FILTER (WHERE status='valid' AND event_slug = ANY(${eventFilter}))::int AS valid, COUNT(*) FILTER (WHERE status='used' AND event_slug = ANY(${eventFilter}))::int AS used, COUNT(*) FILTER (WHERE status IN ('refunded','cancelled') AND event_slug = ANY(${eventFilter}))::int AS invalid FROM tickets`
          : Promise.resolve([{ valid: 0, used: 0, invalid: 0 }]),
      eventFilter === null
        ? sql`
            SELECT
              COUNT(*) FILTER (WHERE status='paid' AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date)::int AS paid_orders,
              COALESCE(SUM(total) FILTER (WHERE status='paid' AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date),0)::int AS revenue,
              COUNT(*) FILTER (WHERE status IN ('cancelled','expired') AND (created_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date)::int AS payment_errors
            FROM orders
          `
        : eventFilter.length
          ? sql`
              SELECT
                COUNT(*) FILTER (WHERE status='paid' AND event_slug = ANY(${eventFilter}) AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date)::int AS paid_orders,
                COALESCE(SUM(total) FILTER (WHERE status='paid' AND event_slug = ANY(${eventFilter}) AND (COALESCE(paid_at,created_at) AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date),0)::int AS revenue,
                COUNT(*) FILTER (WHERE status IN ('cancelled','expired') AND event_slug = ANY(${eventFilter}) AND (created_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date)::int AS payment_errors
              FROM orders
            `
          : Promise.resolve([{ paid_orders: 0, revenue: 0, payment_errors: 0 }]),
      sql`
        SELECT COUNT(*)::int AS new_users
        FROM users
        WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date
      `,
      eventFilter === null
        ? sql`
            SELECT COUNT(*)::int AS used_tickets
            FROM tickets
            WHERE used_at IS NOT NULL
              AND (used_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date
          `
        : eventFilter.length
          ? sql`
              SELECT COUNT(*)::int AS used_tickets
              FROM tickets
              WHERE used_at IS NOT NULL AND event_slug = ANY(${eventFilter})
                AND (used_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${from}::date AND ${to}::date
            `
          : Promise.resolve([{ used_tickets: 0 }]),
    ]);

    const upcomingRows = await sql`
      SELECT slug,title,starts_at,status,sales_state,age_label
      FROM events
      WHERE status='published' AND starts_at >= now()
      ORDER BY starts_at ASC
      LIMIT 12
    `;
    const upcoming = upcomingRows.find((row) => canAccessEvent(access, String(row.slug))) ?? null;

    const period = {
      from,
      to,
      newOrders: Number(periodOrderRows[0]?.paid_orders ?? 0),
      newUsers: Number(periodUserRows[0]?.new_users ?? 0),
      usedTickets: Number(periodTicketRows[0]?.used_tickets ?? 0),
      paymentErrors: Number(periodOrderRows[0]?.payment_errors ?? 0),
      revenue: canSeeRevenue ? Number(periodOrderRows[0]?.revenue ?? 0) : 0,
    };

    return NextResponse.json({
      metrics: {
        revenue: canSeeRevenue ? Number(orderRows[0]?.revenue ?? 0) : 0,
        sold: Number(ticketRows[0]?.valid ?? 0) + Number(ticketRows[0]?.used ?? 0),
        used: Number(ticketRows[0]?.used ?? 0),
        refunds: Number(ticketRows[0]?.invalid ?? 0),
      },
      period,
      // Backwards compatibility for the current admin client while v13.2 rolls out.
      today: {
        newOrders: period.newOrders,
        newUsers: period.newUsers,
        paymentErrors: period.paymentErrors,
      },
      upcoming,
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка обзора" }, { status });
  }
}
