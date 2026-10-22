import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";
import { getRefundPolicyQuote, refundAmountForShare } from "@/lib/server/refund-policy";
import { adminTicketView } from '@/lib/admin-ticket-view';
import { allocatePaidShares } from '@/lib/server/ticket-refunds';

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
        o.id AS order_id,o.public_id AS order_public_id,o.status AS order_status,o.email AS order_email,o.subtotal,o.total,o.refunded_amount,
        o.yookassa_payment_id,o.paid_at,o.legal_version,o.npd_receipt_status,o.npd_receipt_id,o.npd_receipt_url,o.npd_receipt_amount,
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
      WHERE (${access.role === 'owner' || access.allEvents} OR t.event_slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(access.eventSlugs)}::text::jsonb)))
        AND (${q === ""} OR (
        t.public_id ILIKE ${term} OR
        t.owner_name ILIKE ${term} OR
        o.public_id ILIKE ${term} OR
        COALESCE(o.email,'') ILIKE ${term} OR
        COALESCE(u.email,'') ILIKE ${term} OR
        COALESCE(u.phone,'') ILIKE ${term} OR
        COALESCE(u.agayo_id,'') ILIKE ${term} OR
        t.event_slug ILIKE ${term} OR
        t.category_name ILIKE ${term}
      ))
      ORDER BY t.created_at DESC
      LIMIT 1000
    `;

    const canRefund = access.role === "owner" || access.permissions.includes("view_revenue");
    const intents = new Map<string, any>();
    const shares = new Map<string, number>();
    if (canRefund) {
      if (rows.length) {
        const orderIds = JSON.stringify([...new Set(rows.map(row => String(row.order_id)))]);
        const allTickets = await sql`SELECT id,order_id,category_id FROM tickets WHERE order_id::text IN (SELECT jsonb_array_elements_text(${orderIds}::text::jsonb)) ORDER BY created_at,id`;
        const allItems = await sql`SELECT order_id,ticket_category_id,unit_price FROM order_items WHERE order_id::text IN (SELECT jsonb_array_elements_text(${orderIds}::text::jsonb))`;
        for (const orderId of new Set(rows.map(row => String(row.order_id)))) {
          const order = rows.find(row => String(row.order_id) === orderId)!;
          for (const [id, amount] of allocatePaidShares(allTickets.filter(ticket => String(ticket.order_id) === orderId),
            allItems.filter(item => String(item.order_id) === orderId), Number(order.total || 0), Number(order.subtotal || 0))) shares.set(id, amount);
        }
      }
      const [ready] = await sql`SELECT to_regclass('public.admin_refund_requests') IS NOT NULL AS ready`;
      if (ready?.ready && rows.length) {
        const pending = await sql`SELECT id,order_id,ticket_id,status,request_payload,reason FROM admin_refund_requests
          WHERE order_id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify([...new Set(rows.map(row => String(row.order_id)))])}::text::jsonb))
          AND status IN ('unknown','pending')`;
        for (const intent of pending) intents.set(intent.ticket_id ? String(intent.ticket_id) : `order:${intent.order_id}`, intent);
      }
    }
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
        const paidShare = shares.get(String(row.id)) || 0;
        const refundQuoteAmount = canRefund ? refundAmountForShare(paidShare,quote.percent) : 0;
        return adminTicketView({
          ...row,
          refund_request: canRefund ? intents.get(String(row.id)) || intents.get(`order:${row.order_id}`) || null : null,
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
        },canRefund);
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
