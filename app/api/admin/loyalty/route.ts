import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from '@/lib/server/admin';
import { getLoyaltyLevels } from '@/lib/server/loyalty';

export const dynamic = 'force-dynamic';
const HEX=/^#[0-9a-fA-F]{6}$/;

export async function GET() {
  try { await requireAdminPermission('manage_loyalty'); return NextResponse.json({ levels: await getLoyaltyLevels() }); }
  catch (error) { const status = error instanceof AdminAccessError ? error.status : 500; return NextResponse.json({ error:error instanceof Error ? error.message : 'Ошибка' }, { status }); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminPermission('manage_loyalty');
    const body = await request.json();
    const levelKey = String(body.levelKey || '').trim().toUpperCase();
    if (!levelKey) return NextResponse.json({ error:'Уровень не указан' }, { status:400 });
    const sql = db();
    const [current] = await sql`SELECT * FROM loyalty_levels WHERE level_key=${levelKey} LIMIT 1`;
    if (!current) return NextResponse.json({ error:'Уровень не найден' }, { status:404 });

    const displayName = body.displayName == null ? String(current.display_name) : String(body.displayName || '').trim().slice(0, 32);
    const visitsRequired = body.visitsRequired == null ? Number(current.visits_required || 0) : Math.max(0, Math.floor(Number(body.visitsRequired) || 0));
    const autoByVisits = body.autoByVisits == null ? Boolean(current.auto_by_visits) : body.autoByVisits !== false;
    const conditionsText = body.conditionsText == null ? String(current.conditions_text || '') : String(body.conditionsText || '').trim().slice(0, 600);
    const visualMode = body.visualMode == null ? String(current.visual_mode || 'colors') : (body.visualMode === 'image' ? 'image' : 'colors');
    const visualPrimary = body.visualPrimary == null ? String(current.visual_primary || '#121214') : String(body.visualPrimary || '').trim();
    const visualSecondary = body.visualSecondary == null ? String(current.visual_secondary || '#4B0F19') : String(body.visualSecondary || '').trim();
    const visualAccent = body.visualAccent == null ? String(current.visual_accent || '#C21F39') : String(body.visualAccent || '').trim();
    const visualImageUrl = body.visualImageUrl == null ? (current.visual_image_url ? String(current.visual_image_url) : null) : (String(body.visualImageUrl || '').trim().slice(0,2000) || null);
    if (!displayName) return NextResponse.json({ error:'Заполни название уровня' }, { status:400 });
    if (![visualPrimary,visualSecondary,visualAccent].every((value)=>HEX.test(value))) return NextResponse.json({error:'Цвета должны быть в формате #RRGGBB'},{status:400});
    if (visualMode === 'image' && !visualImageUrl) return NextResponse.json({error:'Для режима «Изображение» сначала загрузи фон'},{status:400});

    const rows = await sql`
      UPDATE loyalty_levels SET display_name=${displayName},visits_required=${visitsRequired},auto_by_visits=${autoByVisits},conditions_text=${conditionsText},
        visual_mode=${visualMode},visual_primary=${visualPrimary},visual_secondary=${visualSecondary},visual_accent=${visualAccent},visual_image_url=${visualImageUrl},updated_at=now()
      WHERE level_key=${levelKey}
      RETURNING level_key,display_name,visits_required,auto_by_visits,conditions_text,sort_order,visual_mode,visual_primary,visual_secondary,visual_accent,visual_image_url
    `;

    if (body.displayName != null || body.visitsRequired != null || body.autoByVisits != null) {
      await sql`
        UPDATE users u SET loyalty_level=COALESCE((SELECT l.level_key FROM loyalty_levels l WHERE l.auto_by_visits=true
          AND l.visits_required <= (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id AND t.status='used')
          ORDER BY l.visits_required DESC,l.sort_order DESC LIMIT 1),'NEW'),updated_at=now()
        WHERE u.loyalty_override_level IS NULL
      `;
    }
    await writeAdminAudit(actor.userId,'loyalty.level.update','loyalty_level',levelKey,{ displayName,visitsRequired,autoByVisits,conditionsText,visualMode,visualPrimary,visualSecondary,visualAccent,visualImageUrl });
    const row=rows[0];
    return NextResponse.json({ok:true,level:{levelKey:String(row.level_key),displayName:String(row.display_name),visitsRequired:Number(row.visits_required),autoByVisits:Boolean(row.auto_by_visits),conditionsText:String(row.conditions_text||''),sortOrder:Number(row.sort_order),visualMode:row.visual_mode==='image'?'image':'colors',visualPrimary:String(row.visual_primary),visualSecondary:String(row.visual_secondary),visualAccent:String(row.visual_accent),visualImageUrl:row.visual_image_url?String(row.visual_image_url):null}});
  } catch (error) { const status = error instanceof AdminAccessError ? error.status : 500; return NextResponse.json({ error:error instanceof Error ? error.message : 'Не удалось обновить уровень' }, { status }); }
}
