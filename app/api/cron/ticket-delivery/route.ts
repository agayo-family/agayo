import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server/security';
import { recoverTicketDeliveries } from '@/lib/server/ticket-delivery-recovery';
import { siteOrigin } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret.length < 32) return NextResponse.json({ error: 'Recovery scheduler is not configured' }, { status: 503 });
  if (!safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await recoverTicketDeliveries(siteOrigin())); }
  catch { return NextResponse.json({ error: 'Recovery failed; inspect delivery diagnostics' }, { status: 500 }); }
}
