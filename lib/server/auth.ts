import { cookies } from "next/headers";
import { db } from "./db";
import { hash } from "./security";

export const SESSION_COOKIE = "agayo_session";

export async function getCurrentUser() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const sql = db();
  const rows = await sql`
    SELECT u.id, u.email, u.phone, u.display_name, u.loyalty_level, u.telegram_chat_id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=${hash(raw)} AND s.expires_at > now()
    LIMIT 1
  `;
  return rows[0] ?? null;
}
