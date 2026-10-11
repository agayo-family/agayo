import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { AdminAccessError, requireAdminPermission } from '@/lib/server/admin';
import { db } from '@/lib/server/db';
import { resolveBlobToken } from '@/lib/server/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requireAdminPermission('manage_system');
    const sql = db();
    const [sizes, counts] = await Promise.all([
      sql`SELECT pg_database_size(current_database())::text AS bytes`,
      sql`SELECT (SELECT count(*)::int FROM events) AS events,(SELECT count(*)::int FROM media_photos) AS photos,
        (SELECT count(*)::int FROM users) AS accounts,(SELECT count(*)::int FROM tickets) AS tickets,(SELECT count(*)::int FROM orders) AS orders`,
    ]);
    const token = resolveBlobToken();
    let blob: { configured: boolean; scanned: boolean; bytes?: number; files?: number; partial?: boolean; error?: string } = { configured: Boolean(token), scanned: false };
    if (new URL(request.url).searchParams.get('blob') === '1' && blob.configured) {
      let cursor: string | undefined, bytes = 0, files = 0, hasMore = true;
      try {
        const started = Date.now();
        while (hasMore && files < 20000 && Date.now() - started < 35000) {
          const page = await list({ limit: 1000, cursor, token });
          for (const item of page.blobs) { bytes += item.size; files++; }
          hasMore = page.hasMore; cursor = page.cursor;
        }
        blob = { configured: true, scanned: true, bytes, files, partial: hasMore };
      } catch { blob = { configured: true, scanned: false, error: 'Не удалось прочитать хранилище. Проверь подключение Blob.' }; }
    }
    return NextResponse.json({ databaseBytes: Number(sizes[0].bytes), counts: counts[0], blob, quotaVerified: false, measuredAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: status === 500 ? 'Не удалось измерить объём. Проверь подключение базы.' : (error as Error).message }, { status });
  }
}
