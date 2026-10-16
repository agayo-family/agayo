import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { createTelegramLink, setTelegramPreference, telegramProfile, unlinkTelegram, TelegramError } from "@/lib/server/telegram";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private" };
function answer(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new TelegramError("Недопустимый источник запроса", 403);
}
function failure(error: unknown) { return answer({ error: error instanceof TelegramError ? error.message : "Не удалось изменить доставку Telegram. Билеты остаются в профиле" }, error instanceof TelegramError ? error.status : 500); }
async function owner() {
  const user = await getCurrentUser();
  if (!user) throw new TelegramError("Войди в AGAYO ID", 401);
  return user;
}

export async function GET() {
  try { return answer(await telegramProfile(String((await owner()).id))); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); return answer(await createTelegramLink(String((await owner()).id))); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const user = await owner(), body = await request.json();
    if (body.preference !== "email" && body.preference !== "telegram") throw new TelegramError("Выбери email или Telegram", 400);
    await setTelegramPreference(String(user.id), body.preference);
    return answer(await telegramProfile(String(user.id)));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const user = await owner(); await unlinkTelegram(String(user.id)); return answer(await telegramProfile(String(user.id))); } catch (error) { return failure(error); }
}
