import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from '@/lib/server/admin';
import { getLoyaltyLevels } from '@/lib/server/loyalty';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminPermission('manage_loyalty');
    return NextResponse.json({ levels: await getLoyaltyLevels() });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error:error instanceof Error ? error.message : 'Ошибка' }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminPermission('manage_loyalty');
    const body = await request.json();
    const levelKey = String(body.levelKey || '').trim().toUpperCase();
    const displayName = String(body.displayName || '').trim().slice(0, 32);
    const visitsRequired = Math.max(0, Math.floor(Number(body.visitsRequired) || 0));
    const autoByVisits = body.autoByVisits !== false;
    const conditionsText = String(body.conditionsText || '').trim().slice(0, 600);
    if (!levelKey || displayName.length < 1) return NextResponse.json({ error:'Заполни название уровня' }, { status:400 });

    const sql = db();
    const rows = await sql`
      UPDATE loyalty_levels
      SET display_name=${displayName},visits_required=${visitsRequired},auto_by_visits=${autoByVisits},conditions_text=${conditionsText},updated_at=now()
      WHERE level_key=${levelKey}
      RETURNING level_key,display_name,visits_required,auto_by_visits,conditions_text,sort_order
    `;
    if (!rows[0]) return NextResponse.json({ error:'Уровень не найден' }, { status:404 });

    // Пересчитываем только пользователей без ручного назначения.
    await sql`
      UPDATE users u
      SET loyalty_level=COALESCE((
        SELECT l.level_key
        FROM loyalty_levels l
        WHERE l.auto_by_visits=true
          AND l.visits_required <= (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id AND t.status='used')
        ORDER BY l.visits_required DESC,l.sort_order DESC
        LIMIT 1
      ),'NEW'),updated_at=now()
      WHERE u.loyalty_override_level IS NULL
    `;
    await writeAdminAudit(actor.userId,'loyalty.level.update','loyalty_level',levelKey,{ displayName,visitsRequired,autoByVisits,conditionsText });
    return NextResponse.json({
      ok:true,
      level:{
        levelKey:String(rows[0].level_key),
        displayName:String(rows[0].display_name),
        visitsRequired:Number(rows[0].visits_required),
        autoByVisits:Boolean(rows[0].auto_by_visits),
        conditionsText:String(rows[0].conditions_text || ''),
        sortOrder:Number(rows[0].sort_order),
      },
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error:error instanceof Error ? error.message : 'Не удалось обновить уровень' }, { status });
  }
}
