import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sendLoginCode } from "@/lib/server/email";
import { isSmsConfigured, sendLoginCodeSms } from "@/lib/server/sms";
import { hash, normalizeEmail, normalizePhone, randomCode } from "@/lib/server/security";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const method = body.method === "phone" ? "phone" : "email";
    const destination = method === "email" ? normalizeEmail(body.value ?? "") : normalizePhone(body.value ?? "");
    if ((method === "email" && !destination.includes("@")) || destination.length < 6) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

    if (method === "phone" && !isSmsConfigured()) return NextResponse.json({ error: "Вход по SMS пока не подключён" }, { status: 503 });

    const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const sql = db();
    const recent = await sql`SELECT count(*)::int AS count FROM login_codes WHERE destination=${destination} AND created_at > now() - interval '10 minutes'`;
    if ((recent[0]?.count ?? 0) >= 5) return NextResponse.json({ error: "Слишком много попыток. Попробуй позже." }, { status: 429 });
    if (requestIp) {
      const byIp = await sql`SELECT count(*)::int AS count FROM login_codes WHERE request_ip=${requestIp} AND created_at > now() - interval '10 minutes'`;
      if ((byIp[0]?.count ?? 0) >= 12) return NextResponse.json({ error: "Слишком много запросов с этого устройства. Попробуй позже." }, { status: 429 });
    }

    const code = randomCode();
    const rows = await sql`INSERT INTO login_codes(channel,destination,code_hash,expires_at,request_ip) VALUES(${method},${destination},${hash(code)},now()+interval '10 minutes',${requestIp}) RETURNING id`;
    try {
      if (method === "email") await sendLoginCode(destination, code);
      else await sendLoginCodeSms(destination, code, requestIp);
    } catch (deliveryError) {
      await sql`DELETE FROM login_codes WHERE id=${rows[0].id} AND consumed_at IS NULL`;
      throw deliveryError;
    }

    return NextResponse.json({ ok: true, expiresIn: 600 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось отправить код" }, { status: 500 });
  }
}
