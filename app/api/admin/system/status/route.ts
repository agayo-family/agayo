import { NextResponse } from 'next/server';
import { AdminAccessError, requireAdminPermission } from '@/lib/server/admin';
import { getSystemStatus } from '@/lib/server/system-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminPermission('manage_system');
    return NextResponse.json(await getSystemStatus());
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error:error instanceof Error ? error.message : 'Ошибка проверки системы' }, { status });
  }
}
