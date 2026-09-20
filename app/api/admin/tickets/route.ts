import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";
import { getRefundPolicyQuote, refundAmountForShare } from "@/lib/server/refund-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireAdminPermission("manual_ticket_search");
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 160) ?? "";
    const sql = db();
    const term = `%${q}%`;

    const rows = await sql`
      SELECT
        t.id,t.public_id,t.event_slug,t.owner_name,t.category_id,t.category_name,t.status,t.zone,t.seat,t.used_at,t.created_at,
        u.email,u.phone,u.agayo_id,
        o.id AS order_id,o.public_id AS order_public_id,o.status AS order_status,o.subtotal,o.total,o.refunded_amount,
        o.yookassa_payment_id,o.paid_at,o.npd_receipt_status,o.npd_receipt_id,o.npd_receipt_url,o.npd_receipt_amount,
        e.starts_at AS event_starts_at,
        oi.unit_price,
        (SELECT COUNT(*)::int FROM tickets t2 WHERE t2.order_id=t.order_id) AS order_ticket_count,
        tr.id AS ticket_refund_id,tr.yookassa_refund_id AS ticket_refund_yookassa_id,
        tr.refund_percent AS ticket_refund_percent,tr.amount AS ticket_refund_amount,tr.status AS ticket_refund_status
      FROM tickets t
      JOIN users u ON u.id=t.user_id
      JOIN orders o ON o.id=t.order_id
      LEFT JOIN events e ON e.slug=t.event_slug
      LEFT JOIN order_items oi ON oi.order_id=t.order_id AND oi.ticket_category_id=t.category_id
      LEFT JOIN ticket_refunds tr ON tr.ticket_id=t.id
      WHERE ${q === ""} OR (
        t.public_id ILIKE ${term} OR
        t.owner_name ILIKE ${term} OR
        o.public_id ILIKE ${term} OR
        COALESCE(u.email,'') ILIKE ${term} OR
        COALESCE(u.phone,'') ILIKE ${term} OR
        COALESCE(u.agayo_id,'') ILIKE ${term} OR
        t.event_slug ILIKE ${term} OR
        t.category_name ILIKE ${term}
      )
      ORDER BY t.created_at DESC
      LIMIT 1000
    `;

    const canRefund = access.role === "owner" || access.permissions.includes("view_revenue");
    const tickets = rows
      .filter((row) => canAccessEvent(access, String(row.event_slug)))
      .map((row:any) => {
        const quote = row.event_starts_at
          ? getRefundPolicyQuote(String(row.event_starts_at))
          : { daysBeforeEvent:0, percent:0 as const, label:"Дата события не определена" };
        const subtotal = Number(row.subtotal || 0);
        const total = Number(row.total || 0);
        const unitPrice = Number(row.unit_price || 0);
        const ticketCount = Math.max(1,Number(row.order_ticket_count || 1));
        const paidShare = subtotal > 0 && unitPrice > 0 ? Math.round((total * unitPrice / subtotal) * 100) / 100 : Math.round((total / ticketCount) * 100) / 100;
        const refundQuoteAmount = canRefund ? refundAmountForShare(paidShare,quote.percent) : 0;
        return {
          ...row,
          total:canRefund ? total : 0,
          refunded_amount:canRefund ? Number(row.refunded_amount || 0) : 0,
          yookassa_payment_id:canRefund ? row.yookassa_payment_id : null,
          paid_share:canRefund ? paidShare : 0,
          refund_quote_percent:quote.percent,
          refund_quote_amount:refundQuoteAmount,
          refund_quote_label:quote.label,
          days_before_event:quote.daysBeforeEvent,
          npd_receipt_amount:canRefund ? Number(row.npd_receipt_amount || 0) : 0,
          ticket_refund_amount:canRefund ? Number(row.ticket_refund_amount || 0) : 0,
        };
      });

    return NextResponse.json({
      tickets,
      permissions: {
        canManageTickets: access.role === "owner" || access.permissions.includes("manage_ticket_inventory"),
        canRefund,
        canManageNpd:canRefund,
      },
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка загрузки билетов" }, { status });
  }
}
