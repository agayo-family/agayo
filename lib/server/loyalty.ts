import { db } from './db';

export type LoyaltyLevel = {
  levelKey: string;
  displayName: string;
  visitsRequired: number;
  autoByVisits: boolean;
  conditionsText: string;
  sortOrder: number;
  visualMode: 'colors'|'image';
  visualPrimary: string;
  visualSecondary: string;
  visualAccent: string;
  visualImageUrl: string | null;
};

const FALLBACK_LEVELS: LoyaltyLevel[] = [
  { levelKey:'NEW', displayName:'NEW', visitsRequired:0, autoByVisits:true, conditionsText:'Базовый уровень AGAYO.', sortOrder:10, visualMode:'colors', visualPrimary:'#121214', visualSecondary:'#2A2A30', visualAccent:'#8E8E91', visualImageUrl:null },
  { levelKey:'INSIDE', displayName:'INSIDE', visitsRequired:1, autoByVisits:true, conditionsText:'Автоматически после первого посещённого мероприятия.', sortOrder:20, visualMode:'colors', visualPrimary:'#120D10', visualSecondary:'#4B0F19', visualAccent:'#9B3042', visualImageUrl:null },
  { levelKey:'REGULAR', displayName:'REGULAR', visitsRequired:3, autoByVisits:true, conditionsText:'Для постоянных гостей AGAYO.', sortOrder:30, visualMode:'colors', visualPrimary:'#0C1114', visualSecondary:'#173642', visualAccent:'#4A91A8', visualImageUrl:null },
  { levelKey:'GOLD', displayName:'GOLD', visitsRequired:5, autoByVisits:true, conditionsText:'Особый уровень AGAYO. Может назначаться вручную командой.', sortOrder:40, visualMode:'colors', visualPrimary:'#171207', visualSecondary:'#594519', visualAccent:'#D1AD55', visualImageUrl:null },
  { levelKey:'LEGEND', displayName:'LEGEND', visitsRequired:10, autoByVisits:true, conditionsText:'Высший уровень AGAYO. Условия определяет команда.', sortOrder:50, visualMode:'colors', visualPrimary:'#0A0A0B', visualSecondary:'#3A101B', visualAccent:'#C21F39', visualImageUrl:null },
];

export async function getLoyaltyLevels(): Promise<LoyaltyLevel[]> {
  if (!process.env.DATABASE_URL) return FALLBACK_LEVELS;
  try {
    const rows = await db()`
      SELECT level_key,display_name,visits_required,auto_by_visits,conditions_text,sort_order,
             visual_mode,visual_primary,visual_secondary,visual_accent,visual_image_url
      FROM loyalty_levels
      ORDER BY sort_order,level_key
    `;
    if (!rows.length) return FALLBACK_LEVELS;
    return rows.map((row) => ({
      levelKey:String(row.level_key), displayName:String(row.display_name), visitsRequired:Number(row.visits_required) || 0,
      autoByVisits:Boolean(row.auto_by_visits), conditionsText:String(row.conditions_text || ''), sortOrder:Number(row.sort_order) || 0,
      visualMode:row.visual_mode === 'image' ? 'image' : 'colors',
      visualPrimary:String(row.visual_primary || '#121214'), visualSecondary:String(row.visual_secondary || '#4B0F19'),
      visualAccent:String(row.visual_accent || '#C21F39'), visualImageUrl:row.visual_image_url ? String(row.visual_image_url) : null,
    }));
  } catch (error) {
    console.warn('Loyalty levels:', error instanceof Error ? error.message : error);
    return FALLBACK_LEVELS;
  }
}

export async function updateUserLoyaltyByVisits(userId: string, tx?: any) {
  const sql = tx || db();
  try {
    const [user] = await sql`SELECT loyalty_override_level FROM users WHERE id=${userId} LIMIT 1`;
    if (user?.loyalty_override_level) {
      const levelKey = String(user.loyalty_override_level);
      await sql`UPDATE users SET loyalty_level=${levelKey},updated_at=now() WHERE id=${userId}`;
      return levelKey;
    }
    const [visitRow] = await sql`SELECT COUNT(*)::int AS visits FROM tickets WHERE user_id=${userId} AND status='used'`;
    const visits = Number(visitRow?.visits || 0);
    const rows = await sql`
      SELECT level_key FROM loyalty_levels
      WHERE auto_by_visits=true AND visits_required<=${visits}
      ORDER BY visits_required DESC,sort_order DESC LIMIT 1
    `;
    const levelKey = rows[0]?.level_key ? String(rows[0].level_key) : 'NEW';
    await sql`UPDATE users SET loyalty_level=${levelKey},updated_at=now() WHERE id=${userId}`;
    return levelKey;
  } catch (error) {
    console.warn('Update loyalty:', error instanceof Error ? error.message : error);
    return null;
  }
}
