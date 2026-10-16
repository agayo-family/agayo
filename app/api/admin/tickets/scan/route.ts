import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { AdminAccessError, canAccessEvent, requireAdminPermission } from '@/lib/server/admin';
import { updateUserLoyaltyByVisits } from '@/lib/server/loyalty';

export async function POST(request: Request) {
  try {
    const actor = await requireAdminPermission('scan_tickets');
    const body = await request.json();
    const token = String(body.token ?? '').trim().slice(0, 200);
    if (token.length < 3) return NextResponse.json({ result: 'not_found', error: 'Введи номер билета, заказа или QR' }, { status: 400 });
    const sql = db();
    const isPublicNumber = /^(?:TKT|AGY)-/i.test(token);
    if (isPublicNumber) await requireAdminPermission('manual_ticket_search');
    const [ticket] = await sql`SELECT t.id,t.public_id,t.order_id,t.event_slug FROM tickets t
      WHERE t.qr_token=${token} OR (${isPublicNumber} AND upper(t.public_id)=upper(${token})) LIMIT 1`;
    if (!ticket) {
      if (!isPublicNumber) return NextResponse.json({ result: 'not_found' }, { status: 404 });
      const tickets = await sql`SELECT t.public_id,t.event_slug,t.owner_name,t.category_name,t.status,t.used_at
        FROM tickets t JOIN orders o ON o.id=t.order_id WHERE upper(o.public_id)=upper(${token})
          AND (${actor.role === 'owner' || actor.allEvents} OR t.event_slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(actor.eventSlugs)}::text::jsonb)))
        ORDER BY t.created_at,t.id LIMIT 50`;
      if (!tickets.length) return NextResponse.json({ result: 'not_found' }, { status: 404 });
      return NextResponse.json({ result: 'choose_ticket', tickets,
        error: 'Выбери билет конкретного гостя. Остальные билеты заказа останутся действительными.' });
    }
    if (!canAccessEvent(actor, String(ticket.event_slug))) throw new AdminAccessError('Нет доступа к этому мероприятию', 403);
    const result = await sql.begin(async tx => {
      // Refund creation holds the same order lock as a pass.
      await tx`SELECT id FROM orders WHERE id=${ticket.order_id} FOR UPDATE`;
      const [current] = await tx`SELECT id,public_id,user_id,event_slug,owner_name,category_name,status,used_at
        FROM tickets WHERE id=${ticket.id} FOR UPDATE`;
      if (!current) return { result: 'not_found' as const };
      if (current.status === 'used') return { result: 'already_used' as const, ticket: current };
      if (current.status !== 'valid') return { result: 'invalid' as const, ticket: current };
      const [refund] = await tx`SELECT ticket_id FROM ticket_refunds r WHERE ticket_id=${ticket.id}
        AND NOT (status='failed' AND coalesce(to_jsonb(r)->>'reason','')='provider_canceled') LIMIT 1`;
      if (refund) return { result: 'invalid' as const, ticket: current, error: 'По билету запрошен возврат. До сверки платежа проход приостановлен.' };
      const [schema] = await tx`SELECT to_regclass('public.admin_refund_requests') IS NOT NULL AS ready`;
      if (schema?.ready) {
        const [pending] = await tx`SELECT id FROM admin_refund_requests WHERE order_id=${ticket.order_id}
          AND status IN ('unknown','pending') AND (ticket_id IS NULL OR ticket_id=${ticket.id}) LIMIT 1`;
        if (pending) return { result: 'invalid' as const, ticket: current, error: 'По заказу сверяется возврат. Проход временно приостановлен.' };
      }
      const [updated] = await tx`UPDATE tickets SET status='used',used_at=now(),used_by=${actor.userId}
        WHERE id=${ticket.id} AND status='valid'
        RETURNING id,public_id,user_id,event_slug,owner_name,category_name,status,used_at`;
      await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
        VALUES(${actor.userId},'ticket.scan','ticket',${String(ticket.id)},
          ${JSON.stringify({ publicId: String(ticket.public_id), eventSlug: String(ticket.event_slug), manual: isPublicNumber })}::text::jsonb)`;
      return { result: 'accepted' as const, ticket: updated };
    });
    if (result.result === 'accepted') await updateUserLoyaltyByVisits(String(result.ticket.user_id));
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    if (status === 500) console.error('Ticket scan failed', error);
    return NextResponse.json({ result: 'not_found', error: status === 500 ? 'Не удалось проверить билет. Повтори проверку.' : (error as Error).message }, { status });
  }
}
