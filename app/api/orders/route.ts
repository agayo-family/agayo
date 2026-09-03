import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getEventServer } from "@/lib/server/events";
import { normalizeEmail, normalizePhone, publicId } from "@/lib/server/security";
import { createPayment } from "@/lib/server/yookassa";

export async function POST(request: Request) {
  let createdOrderId: string | null = null;
  try {
    const body = await request.json();
    const event = await getEventServer(String(body.eventSlug ?? ""));
    const category = event?.tickets.find((item) => item.id === body.categoryId);
    const quantity = Math.max(1, Math.min(6, Number(body.quantity) || 1));
    const email = normalizeEmail(body.email ?? "");
    const phone = normalizePhone(body.phone ?? "");
    const ownerName = String(body.name ?? "").trim().slice(0, 120);
    if (!event || event.status !== "published" || event.salesState !== "open" || !category || category.soldOut) return NextResponse.json({ error: "Билет недоступен" }, { status: 400 });
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
      const dbCategories = await tx`
        SELECT c.id,c.inventory FROM event_ticket_categories c
        JOIN events e ON e.id=c.event_id
        WHERE e.slug=${event.slug} AND c.category_key=${category.id}
        FOR UPDATE
      `;
      const dbCategory = dbCategories[0];
      if (dbCategory?.inventory != null) {
        const [counts] = await tx`
          SELECT
            (SELECT COUNT(*)::int FROM tickets t WHERE t.event_slug=${event.slug} AND t.category_id=${category.id} AND t.status IN ('valid','used')) AS sold,
            (SELECT COALESCE(SUM(r.quantity),0)::int FROM ticket_inventory_reservations r WHERE r.event_slug=${event.slug} AND r.category_id=${category.id} AND r.consumed_at IS NULL AND r.released_at IS NULL) AS reserved
        `;
        const available = Number(dbCategory.inventory) - Number(counts.sold || 0) - Number(counts.reserved || 0);
        if (available < quantity) throw new Error(available <= 0 ? "Эта категория распродана" : `Доступно только ${available} билет(а)`);
      }

      let users = await tx`SELECT * FROM users WHERE email=${email} LIMIT 1`;
      if (!users[0]) users = await tx`INSERT INTO users(email,phone,display_name) VALUES(${email},${phone || null},${ownerName}) RETURNING *`;
      else await tx`UPDATE users SET display_name=COALESCE(display_name,${ownerName}), phone=COALESCE(phone,${phone || null}), updated_at=now() WHERE id=${users[0].id}`;
      const user = users[0];
      const orderPublicId = publicId("AGY");
      const orders = await tx`INSERT INTO orders(public_id,user_id,event_slug,email,phone,owner_name,subtotal,discount,total,promo_code) VALUES(${orderPublicId},${user.id},${event.slug},${email},${phone || null},${ownerName},${subtotal},${discount},${total},${promoCode}) RETURNING *`;
      createdOrderId = String(orders[0].id);
      await tx`INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES(${orders[0].id},${category.id},${category.name},${category.price},${quantity})`;
      if (dbCategory?.inventory != null) await tx`INSERT INTO ticket_inventory_reservations(order_id,event_slug,category_id,quantity) VALUES(${orders[0].id},${event.slug},${category.id},${quantity})`;
      return { order: orders[0], user };
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    try {
      const payment = await createPayment({ amount: total, orderPublicId: result.order.public_id, description: `${event.title} · ${category.name} × ${quantity}`, returnUrl: `${base}/checkout/success?order=${encodeURIComponent(result.order.public_id)}`, customerEmail: email });
      await sql`UPDATE orders SET yookassa_payment_id=${payment.id} WHERE id=${result.order.id}`;
      const confirmationUrl = payment.confirmation?.confirmation_url;
      if (!confirmationUrl) throw new Error("YooKassa did not return confirmation URL");
      return NextResponse.json({ ok: true, orderId: result.order.public_id, confirmationUrl });
    } catch (paymentError) {
      await sql.begin(async (tx: any) => {
        await tx`UPDATE orders SET status='cancelled' WHERE id=${result.order.id} AND status='pending'`;
        await tx`UPDATE ticket_inventory_reservations SET released_at=now() WHERE order_id=${result.order.id} AND consumed_at IS NULL`;
      });
      throw paymentError;
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Не удалось создать заказ";
    return NextResponse.json({ error: message }, { status: message.includes("Доступно") || message.includes("распродана") ? 409 : 500 });
  }
}
