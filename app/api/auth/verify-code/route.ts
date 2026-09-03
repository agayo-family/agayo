import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { SESSION_COOKIE } from "@/lib/server/auth";
import { hash, normalizeEmail, normalizePhone, randomToken } from "@/lib/server/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const method = body.method === "phone" ? "phone" : "email";
    const destination = method === "email" ? normalizeEmail(body.value ?? "") : normalizePhone(body.value ?? "");
    const code = String(body.code ?? "");
    const sql = db();
    const rows = await sql`SELECT id, code_hash, attempts FROM login_codes WHERE channel=${method} AND destination=${destination} AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`;
    const row = rows[0];
    if (!row || row.attempts >= 5 || row.code_hash !== hash(code)) {
      if (row) await sql`UPDATE login_codes SET attempts=attempts+1 WHERE id=${row.id}`;
      return NextResponse.json({ error: "Неверный или истёкший код" }, { status: 401 });
    }
    await sql`UPDATE login_codes SET consumed_at=now() WHERE id=${row.id}`;

    let users = method === "email" ? await sql`SELECT * FROM users WHERE email=${destination} LIMIT 1` : await sql`SELECT * FROM users WHERE phone=${destination} LIMIT 1`;
    if (!users[0]) users = method === "email" ? await sql`INSERT INTO users(email) VALUES(${destination}) RETURNING *` : await sql`INSERT INTO users(phone) VALUES(${destination}) RETURNING *`;
    const user = users[0];
    const raw = randomToken();
    await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${user.id},${hash(raw)},now()+interval '30 days')`;

    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, phone: user.phone, displayName: user.display_name, agayoId: user.agayo_id } });
    response.cookies.set(SESSION_COOKIE, raw, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось войти" }, { status: 500 });
  }
}
