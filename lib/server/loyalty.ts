import { db } from './db';

export type LoyaltyLevel = {
  levelKey: string;
  displayName: string;
  visitsRequired: number;
  sortOrder: number;
};

const FALLBACK_LEVELS: LoyaltyLevel[] = [
  { levelKey:'NEW', displayName:'NEW', visitsRequired:0, sortOrder:10 },
  { levelKey:'INSIDE', displayName:'INSIDE', visitsRequired:1, sortOrder:20 },
  { levelKey:'REGULAR', displayName:'REGULAR', visitsRequired:3, sortOrder:30 },
  { levelKey:'GOLD', displayName:'GOLD', visitsRequired:5, sortOrder:40 },
  { levelKey:'LEGEND', displayName:'LEGEND', visitsRequired:10, sortOrder:50 },
];

export async function getLoyaltyLevels(): Promise<LoyaltyLevel[]> {
  if (!process.env.DATABASE_URL) return FALLBACK_LEVELS;
  try {
    const rows = await db()`
      SELECT level_key,display_name,visits_required,sort_order
      FROM loyalty_levels
      ORDER BY visits_required,sort_order,level_key
    `;
    if (!rows.length) return FALLBACK_LEVELS;
    return rows.map((row) => ({
      levelKey:String(row.level_key),
      displayName:String(row.display_name),
      visitsRequired:Number(row.visits_required) || 0,
      sortOrder:Number(row.sort_order) || 0,
    }));
  } catch (error) {
    console.warn('Loyalty levels:', error instanceof Error ? error.message : error);
    return FALLBACK_LEVELS;
  }
}

export async function updateUserLoyaltyByVisits(userId: string, tx?: any) {
  const sql = tx || db();
  try {
    const [visitRow] = await sql`
      SELECT COUNT(*)::int AS visits
      FROM tickets
      WHERE user_id=${userId} AND status='used'
    `;
    const visits = Number(visitRow?.visits || 0);
    const rows = await sql`
      SELECT level_key
      FROM loyalty_levels
      WHERE visits_required<=${visits}
      ORDER BY visits_required DESC,sort_order DESC
      LIMIT 1
    `;
    const levelKey = rows[0]?.level_key ? String(rows[0].level_key) : 'NEW';
    await sql`UPDATE users SET loyalty_level=${levelKey},updated_at=now() WHERE id=${userId}`;
    return levelKey;
  } catch (error) {
    console.warn('Update loyalty:', error instanceof Error ? error.message : error);
    return null;
  }
}
