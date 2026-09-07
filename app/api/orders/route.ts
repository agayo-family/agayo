import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getEventServer } from "@/lib/server/events";
import { getEventCatalogBadge } from "@/lib/events";
import { normalizeEmail, normalizePhone, publicId } from "@/lib/server/security";
import { createPayment } from "@/lib/server/yookassa";
import { DEFAULT_EVENT_RULES, LEGAL_VERSION } from "@/lib/legal";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = await getEventServer(String(body.eventSlug ?? ""));
    const category = event?.tickets.find((item) => item.id === body.categoryId);
    const quantity = Math.max(1, Math.min(6, Number(body.quantity) || 1));
    const email = normalizeEmail(body.email ?? "");
    const phone = normalizePhone(body.phone ?? "");
    const ownerName = String(body.name ?? "").trim().slice(0, 120);
    const acceptedDocuments = body.acceptedDocuments === true;
    const acceptedPrivacy = body.acceptedPrivacy === true;
    const requestedPromo = String(body.promo ?? "").trim().toUpperCase();

    if (!event || event.status !== "published" || getEventCatalogBadge(event) !== "tickets" || !category || category.soldOut) {
      return NextResponse.json({ error: "Билет недоступен" }, { status: 400 });
    }
    if (!email.includes("@") || ownerName.length < 2) return NextResponse.json({ error: "Проверь имя и email" }, { status: 400 });
    if (!acceptedDocuments) return NextResponse.json({ error: "Прими Пользовательское соглашение, Публичную оферту и Правила мероприятия" }, { status: 400 });
    if (!acceptedPrivacy) return NextResponse.json({ error: "Нужно отдельно подтвердить согласие на обработку персональных данных" }, { status: 400 });

    const sql = db();
    const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const requestUserAgent = request.headers.get("user-agent")?.slice(0, 500) || null;
    const eventRulesSnapshot = (event.eventRules || "").trim() || DEFAULT_EVENT_RULES;
    const subtotal = category.price * quantity;
    if (subtotal <= 0) return NextResponse.json({ error:"Бесплатный билет нельзя оформить через платёжный checkout" }, { status:400 });

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

      let promo: any = null;
      let discount = 0;
      let total = subtotal;
      if (requestedPromo) {
        const promoRows = await tx`
          SELECT id,code,discount_type,discount_value,usage_limit,used_count
          FROM promo_codes
          WHERE upper(code)=${requestedPromo}
            AND is_active=true
            AND (event_slug IS NULL OR event_slug=${event.slug})
            AND (starts_at IS NULL OR starts_at<=now())
            AND (expires_at IS NULL OR expires_at>now())
          LIMIT 1
          FOR UPDATE
        `;
        promo = promoRows[0];
        if (!promo) throw new Error("Промокод не найден или больше не действует");

        if (promo.usage_limit != null) {
          const [reservationCount] = await tx`
            SELECT COUNT(*)::int AS count
            FROM promo_code_reservations
            WHERE promo_code_id=${promo.id} AND consumed_at IS NULL AND released_at IS NULL
          `;
          const claimed = Number(promo.used_count || 0) + Number(reservationCount?.count || 0);
          if (claimed >= Number(promo.usage_limit)) throw new Error("Лимит этого промокода уже закончился");
        }

        const value = Math.max(0,Number(promo.discount_value) || 0);
        discount = promo.discount_type === "fixed"
          ? Math.min(value,subtotal)
          : Math.floor(subtotal * Math.min(value,100) / 100);
        total = Math.max(0,subtotal - discount);
        if (total <= 0) throw new Error("Промокод не может снижать публичный заказ до 0 ₽. Уменьши скидку");
      }

      let users = await tx`SELECT * FROM users WHERE email=${email} LIMIT 1`;
      if (!users[0]) users = await tx`INSERT INTO users(email,phone,display_name) VALUES(${email},${phone || null},${ownerName}) RETURNING *`;
      else await tx`UPDATE users SET display_name=COALESCE(display_name,${ownerName}),phone=COALESCE(phone,${phone || null}),updated_at=now() WHERE id=${users[0].id}`;
      const user = users[0];
      const orderPublicId = publicId("AGY");
      const orders = await tx`
        INSERT INTO orders(
          public_id,user_id,event_slug,email,phone,owner_name,subtotal,discount,total,promo_code,
          legal_accepted_at,privacy_accepted_at,legal_version,event_rules_snapshot,legal_acceptance_ip,legal_acceptance_user_agent
        )
        VALUES(
          ${orderPublicId},${user.id},${event.slug},${email},${phone || null},${ownerName},${subtotal},${discount},${total},${promo ? String(promo.code) : null},
          now(),now(),${LEGAL_VERSION},${eventRulesSnapshot},${requestIp},${requestUserAgent}
        )
        RETURNING *
      `;
      await tx`INSERT INTO order_items(order_id,ticket_category_id,ticket_category_name,unit_price,quantity) VALUES(${orders[0].id},${category.id},${category.name},${category.price},${quantity})`;
      if (dbCategory?.inventory != null) {
        await tx`INSERT INTO ticket_inventory_reservations(order_id,event_slug,category_id,quantity) VALUES(${orders[0].id},${event.slug},${category.id},${quantity})`;
      }
      if (promo) {
        await tx`INSERT INTO promo_code_reservations(order_id,promo_code_id) VALUES(${orders[0].id},${promo.id})`;
      }
      return { order:orders[0],user,total };
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    try {
      const payment = await createPayment({
        amount:result.total,
        orderPublicId:result.order.public_id,
        description:`${event.title} · ${category.name} × ${quantity}`,
        returnUrl:`${base}/checkout/success?order=${encodeURIComponent(result.order.public_id)}`,
        customerEmail:email,
      });
      await sql`UPDATE orders SET yookassa_payment_id=${payment.id} WHERE id=${result.order.id}`;
      const confirmationUrl = payment.confirmation?.confirmation_url;
      if (!confirmationUrl) throw new Error("YooKassa did not return confirmation URL");
      return NextResponse.json({ ok:true,orderId:result.order.public_id,confirmationUrl });
    } catch (paymentError) {
      await sql.begin(async (tx: any) => {
        await tx`UPDATE orders SET status='cancelled' WHERE id=${result.order.id} AND status='pending'`;
        await tx`UPDATE ticket_inventory_reservations SET released_at=now() WHERE order_id=${result.order.id} AND consumed_at IS NULL`;
        await tx`UPDATE promo_code_reservations SET released_at=now() WHERE order_id=${result.order.id} AND consumed_at IS NULL`;
      });
      throw paymentError;
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Не удалось создать заказ";
    const status = message.includes("Доступно") || message.includes("распродана") || message.includes("Лимит") ? 409
      : message.includes("Промокод") ? 400
      : 500;
    return NextResponse.json({ error:message }, { status });
  }
}
