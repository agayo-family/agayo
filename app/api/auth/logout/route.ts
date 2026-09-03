import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/server/db";
import { SESSION_COOKIE } from "@/lib/server/auth";
import { hash } from "@/lib/server/security";

export async function POST() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw && process.env.DATABASE_URL) await db()`DELETE FROM sessions WHERE token_hash=${hash(raw)}`;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
