import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import { recoverOrderDelivery, ticketDeliveryDiagnostics } from '@/lib/server/ticket-delivery-recovery';
import { siteOrigin } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AdminAccessError ? error.message : 'Не удалось проверить доставку. Обнови диагностику.' },
    { status: error instanceof AdminAccessError ? error.status : 500 });
}

export async function GET() {
  try { await requireAdminPermission('manage_system'); return NextResponse.json(await ticketDeliveryDiagnostics()); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
    }
    const actor = await requireAdminPermission('manage_system');
    const body = await request.json();
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (!/^[A-Za-z0-9-]{5,80}$/.test(orderId)) return NextResponse.json({ error: 'Укажи номер заказа' }, { status: 400 });
    const [order] = await db()`SELECT event_slug FROM orders WHERE public_id=${orderId} AND status='paid' LIMIT 1`;
    if (!order) return NextResponse.json({ error: 'Оплаченный заказ не найден' }, { status: 404 });
    await requireAdminPermission('manage_ticket_inventory', String(order.event_slug));
    await writeAdminAudit(actor.userId, 'ticket.delivery.retry', 'order', orderId);
    // A provider rejection is already recorded against the delivery. Return the
    // fresh diagnostics so the owner sees its actionable, sanitized reason.
    let completed = false;
    try { completed = await recoverOrderDelivery(orderId, siteOrigin()); } catch {}
    return NextResponse.json({ completed, ...await ticketDeliveryDiagnostics() });
  } catch (error) { return failure(error); }
}
