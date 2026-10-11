import { NextResponse } from 'next/server';
import { getPublicPhotoPage } from '@/lib/server/public-content';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = Number(params.get('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return NextResponse.json({ error: 'Некорректная страница' }, { status: 400 });
  const raw = params.get('events');
  const eventSlugs = raw === null ? undefined : raw.split(',').filter(Boolean).slice(0, 100);
  if (eventSlugs?.some(slug => slug.length > 200)) return NextResponse.json({ error: 'Некорректное событие' }, { status: 400 });
  const data = await getPublicPhotoPage({ offset, sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest', eventSlugs });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
}
