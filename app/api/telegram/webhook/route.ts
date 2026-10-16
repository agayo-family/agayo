import { NextResponse } from "next/server";
import { acceptsTelegramWebhook, confirmTelegramLink, consumeTelegramLink, telegramStart } from "@/lib/server/telegram";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!acceptsTelegramWebhook(request.headers.get("x-telegram-bot-api-secret-token"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 65536) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 65536) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const start = telegramStart(JSON.parse(raw));
    if (!start) return NextResponse.json({ ok: true });
    if (await consumeTelegramLink(start.token, start.chatId)) await confirmTelegramLink(start.chatId);
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram retries a failed webhook. Consumed tokens are one-use, so replay
    // can never attach a different account or resend the confirmation.
    return NextResponse.json({ error: "Telegram link could not be processed" }, { status: 500 });
  }
}
