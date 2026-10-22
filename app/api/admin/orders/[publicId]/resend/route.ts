import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminPermission } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import { getEventServer } from '@/lib/server/events';
import { prepareOrderResend, runOrderResend, TicketResendError } from '@/lib/server/order-ticket-resend';
import { siteOrigin } from '@/lib/site';

export const runtime = 'nodejs';
export const maxDuration = 180;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
    }
    const actor = await requireAdminPermission('manage_ticket_inventory');
    const { publicId } = await params;
    if (!/^[A-Za-z0-9-]{5,80}$/.test(publicId)) return NextResponse.json({ error: 'Заказ не указан' }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (typeof body?.requestId !== 'string' || !UUID.test(body.requestId)) return NextResponse.json({ error: 'Некорректный запрос отправки' }, { status: 400 });
    const sql = db();
    const [order] = await sql`SELECT id,event_slug,status FROM orders WHERE public_id=${publicId} LIMIT 1`;
    if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    await requireAdminPermission('manage_ticket_inventory', String(order.event_slug));
    if (order.status !== 'paid') throw new TicketResendError('Повторная отправка доступна для оплаченного заказа');
    const event = await getEventServer(String(order.event_slug));
    if (!event) throw new TicketResendError('Не удалось загрузить данные мероприятия');
    await prepareOrderResend(sql, { requestId: body.requestId, orderId: String(order.id), actorId: actor.userId, event, baseUrl: siteOrigin() });
    return NextResponse.json(await runOrderResend(sql, body.requestId, actor.userId));
  } catch (error) {
    const known = error instanceof AdminAccessError || error instanceof TicketResendError;
    return NextResponse.json({ error: known ? error.message : 'Не удалось подтвердить отправку. Повтори проверку этой же попытки.' },
      { status: known ? error.status : 500 });
  }
}
