import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from '@/lib/server/admin';
import { updateUserLoyaltyByVisits } from '@/lib/server/loyalty';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminPermission('manage_loyalty');
    const body = await request.json();
    const userId = String(body.userId || '').trim();
    const reset = body.reset === true;
    if (!userId) return NextResponse.json({ error:'Пользователь не указан' }, { status:400 });

    const sql = db();
    const [user] = await sql`SELECT id FROM users WHERE id=${userId} LIMIT 1`;
    if (!user) return NextResponse.json({ error:'Пользователь не найден' }, { status:404 });

    if (reset) {
      await sql`
        UPDATE users
        SET loyalty_override_level=NULL,loyalty_override_note=NULL,loyalty_override_at=NULL,updated_at=now()
        WHERE id=${userId}
      `;
      const levelKey = await updateUserLoyaltyByVisits(userId);
      await writeAdminAudit(actor.userId,'loyalty.user.auto','user',userId,{ levelKey });
      return NextResponse.json({ ok:true, loyaltyLevel:levelKey || 'NEW', overrideLevel:null, overrideNote:null });
    }

    const levelKey = String(body.levelKey || '').trim().toUpperCase();
    const note = String(body.note || '').trim().slice(0, 1000);
    if (!levelKey) return NextResponse.json({ error:'Выбери уровень' }, { status:400 });
    const [level] = await sql`SELECT level_key FROM loyalty_levels WHERE level_key=${levelKey} LIMIT 1`;
    if (!level) return NextResponse.json({ error:'Уровень не найден' }, { status:404 });

    await sql`
      UPDATE users
      SET loyalty_level=${levelKey},loyalty_override_level=${levelKey},loyalty_override_note=${note || null},loyalty_override_at=now(),updated_at=now()
      WHERE id=${userId}
    `;
    await writeAdminAudit(actor.userId,'loyalty.user.override','user',userId,{ levelKey,note });
    return NextResponse.json({ ok:true, loyaltyLevel:levelKey, overrideLevel:levelKey, overrideNote:note || null });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error:error instanceof Error ? error.message : 'Не удалось изменить уровень пользователя' }, { status });
  }
}
