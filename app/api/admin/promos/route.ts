import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-ZА-ЯЁ0-9_-]/g, "").slice(0, 32);
}

export async function GET() {
  try {
    const access = await requireAdminPermission("manage_promos");
    const sql = db();
    const rows = await sql`SELECT id,code,event_slug,discount_type,discount_value,usage_limit,used_count,expires_at,is_active,created_at FROM promo_codes ORDER BY created_at DESC LIMIT 200`;
    return NextResponse.json({ promos: rows.filter((row) => canAccessEvent(access, row.event_slug ? String(row.event_slug) : null)) });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventSlug = String(body.eventSlug ?? "").trim() || null;
    const actor = await requireAdminPermission("manage_promos", eventSlug);
    const code = normalizeCode(body.code);
    if (code.length < 3) return NextResponse.json({ error: "Промокод должен содержать минимум 3 символа" }, { status: 400 });
    const discountType = body.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Math.floor(Number(body.discountValue));
    if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "percent" && discountValue > 100)) {
      return NextResponse.json({ error: discountType === "percent" ? "Скидка должна быть от 1 до 100%" : "Укажи сумму скидки" }, { status: 400 });
    }
    const usageLimit = body.usageLimit ? Math.max(1, Math.floor(Number(body.usageLimit))) : null;
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
    if (expiresAt && Number.isNaN(expiresAt.valueOf())) return NextResponse.json({ error: "Некорректный срок действия" }, { status: 400 });

    const sql = db();
    if (eventSlug) {
      const event = await sql`SELECT 1 FROM events WHERE slug=${eventSlug} LIMIT 1`;
      if (!event[0]) return NextResponse.json({ error: "Событие не найдено" }, { status: 404 });
    }
    const exists = await sql`SELECT 1 FROM promo_codes WHERE code=${code} LIMIT 1`;
    if (exists[0]) return NextResponse.json({ error: "Такой промокод уже существует" }, { status: 409 });
    const rows = await sql`
      INSERT INTO promo_codes(code,event_slug,discount_type,discount_value,usage_limit,expires_at,is_active)
      VALUES(${code},${eventSlug},${discountType},${discountValue},${usageLimit},${expiresAt ? expiresAt.toISOString() : null},true)
      RETURNING id,code,event_slug,discount_type,discount_value,usage_limit,used_count,expires_at,is_active,created_at
    `;
    await writeAdminAudit(actor.userId, "promo.create", "promo_code", String(rows[0].id), { code, eventSlug, discountType, discountValue });
    return NextResponse.json({ ok: true, promo: rows[0] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать промокод" }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const sql = db();
    const current = await sql`SELECT id,code,event_slug,is_active FROM promo_codes WHERE id=${id} LIMIT 1`;
    if (!current[0]) return NextResponse.json({ error: "Промокод не найден" }, { status: 404 });
    const actor = await requireAdminPermission("manage_promos", current[0].event_slug ? String(current[0].event_slug) : null);
    const active = Boolean(body.isActive);
    const rows = await sql`UPDATE promo_codes SET is_active=${active} WHERE id=${id} RETURNING id,code,event_slug,discount_type,discount_value,usage_limit,used_count,expires_at,is_active,created_at`;
    await writeAdminAudit(actor.userId, active ? "promo.enable" : "promo.disable", "promo_code", id, { code: String(current[0].code) });
    return NextResponse.json({ ok: true, promo: rows[0] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось изменить промокод" }, { status });
  }
}
