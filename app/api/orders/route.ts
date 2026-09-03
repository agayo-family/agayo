import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getEvent } from "@/lib/events";
import { normalizeEmail, normalizePhone, publicId } from "@/lib/server/security";
import { createPayment } from "@/lib/server/yookassa";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = getEvent(String(body.eventSlug ?? ""));
    const category = event?.tickets.find((item) => item.id === body.categoryId);
    const quantity = Math.max(1, Math.min(6, Number(body.quantity) || 1));
    const email = normalizeEmail(body.email ?? "");
    const phone = normalizePhone(body.phone ?? "");
    const ownerName = String(body.name ?? "").trim().slice(0, 120);
    if (!event || event.status !== "published" || event.salesState !== "open" || !category) return NextResponse.json({ error: "Билет недоступен" }, { status: 400 });
    if (!email.includes("@") || ownerName.length < 2) return NextResponse.json({ error: "Проверь имя и email" }, { status: 400 });

    const sql = db();
    const subtotal = category.price * quantity;
    let discount = 0; let promoCode: string | null = null;
    const requestedPromo = String(body.promo ?? "").trim().toUpperCase();
    if (requestedPromo) {
      const promos = await sql`SELECT * FROM promo_codes WHERE upper(code)=${requestedPromo} AND is_active=true AND (event_slug IS NULL OR event_slug=${event.slug}) AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now()) AND (usage_limit IS NULL OR used_count<usage_limit) LIMIT 1`;
      const promo = promos[0];
      if (!promo) return NextResponse.json({ error: "Промокод не найден или больше не действует" }, { status: 400 });
      discount = promo.discount_type === "percent" ? Math.floor(subtotal * Math.min(Number(promo.discount_value), 100) / 100) : Math.min(Number(promo.discount_value), subtotal);
      promoCode = promo.code;
    }
    const total = Math.max(0, subtotal - discount);

    const result = await sql.begin(async (tx: any) => {
      let users = await tx`SELECT * FROM users WHERE email=${email} LIMIT 1`;
      if (!users[0]) users = await tx`INSERT INTO users(email,phone,display_name) VALUES(${email},${phone || null},${ownerName}) RETURNING *`;
      else await tx`UPDATE users SET display_name=COALESCE(display_name,${ownerName}), phone=COALESCE(phone,${phone || null}), updated_at=now() WHERE id=${users[0].id}`;
      const user = users[0];
      const orderPublicId = publicId("AGY");
      const orders = await tx`INSERT INTO orders(public_id,user_id,event_slug,email,phone,owner_name,subtotal,discount,total,promo_code) VALUES(${orderPublicId},${user.id},${event.slug},${email},${phone || null},${ownerName},${subtotal},${discount},${total},${promoCode}) RETURNING *`;
      await tx`INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES(${orders[0].id},${category.id},${category.name},${category.price},${quantity})`;
      return { order: orders[0], user };
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const payment = await createPayment({ amount: total, orderPublicId: result.order.public_id, description: `${event.title} · ${category.name} × ${quantity}`, returnUrl: `${base}/checkout/success?order=${encodeURIComponent(result.order.public_id)}`, customerEmail: email });
    await sql`UPDATE orders SET yookassa_payment_id=${payment.id} WHERE id=${result.order.id}`;
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) throw new Error("YooKassa did not return confirmation URL");
    return NextResponse.json({ ok: true, orderId: result.order.public_id, confirmationUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать заказ" }, { status: 500 });
  }
}
