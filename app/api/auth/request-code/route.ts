import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sendLoginCode } from "@/lib/server/email";
import { hash, normalizeEmail, normalizePhone, randomCode } from "@/lib/server/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const method = body.method === "phone" ? "phone" : "email";
    const destination = method === "email" ? normalizeEmail(body.value ?? "") : normalizePhone(body.value ?? "");
    if ((method === "email" && !destination.includes("@")) || destination.length < 6) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

    const sql = db();
    const recent = await sql`SELECT count(*)::int AS count FROM login_codes WHERE destination=${destination} AND created_at > now() - interval '10 minutes'`;
    if ((recent[0]?.count ?? 0) >= 5) return NextResponse.json({ error: "Слишком много попыток. Попробуй позже." }, { status: 429 });

    const code = randomCode();
    await sql`INSERT INTO login_codes(channel,destination,code_hash,expires_at) VALUES(${method},${destination},${hash(code)},now()+interval '10 minutes')`;
    if (method === "email") await sendLoginCode(destination, code);
    else return NextResponse.json({ error: "SMS-провайдер будет подключён отдельным этапом" }, { status: 501 });

    return NextResponse.json({ ok: true, expiresIn: 600 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось отправить код" }, { status: 500 });
  }
}
