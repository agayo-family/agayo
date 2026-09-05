import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";

function cleanHex(value: unknown, fallback: string) {
  const s = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}
function keyify(value: string, fallback: string) {
  return value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
}

async function eventById(id: string) {
  const sql = db();
  const rows = await sql`SELECT * FROM events WHERE id=${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const event = await eventById(id);
    if (!event) return NextResponse.json({ error: "Мероприятие не найдено" }, { status: 404 });
    await requireAdminPermission("manage_events", String(event.slug));
    const sql = db();
    const categories = await sql`
      SELECT c.*,
        COALESCE((SELECT COUNT(*)::int FROM tickets t WHERE t.event_slug=${event.slug} AND t.category_id=c.category_key AND t.status IN ('valid','used')),0)::int AS sold_count
      FROM event_ticket_categories c
      WHERE c.event_id=${id}
      ORDER BY c.sort_order, c.name
    `;
    const program = await sql`SELECT id,time_label,title,sort_order FROM event_program_items WHERE event_id=${id} ORDER BY sort_order`;
    return NextResponse.json({ event, categories, program });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка" }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const current = await eventById(id);
    if (!current) return NextResponse.json({ error: "Мероприятие не найдено" }, { status: 404 });
    const body = await request.json();
    const wantsPublished = body.status === "published";
    const actor = await requireAdminPermission(wantsPublished ? "publish_events" : "manage_events", String(current.slug));
    const title = String(body.title || "").trim();
    if (title.length < 2) return NextResponse.json({ error: "Укажи название мероприятия" }, { status: 400 });
    const startsAt = new Date(String(body.startsAt || ""));
    if (Number.isNaN(startsAt.valueOf())) return NextResponse.json({ error: "Укажи дату и время начала" }, { status: 400 });
    const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
    const salesState = ["open", "closed", "coming-soon"].includes(body.salesState) ? body.salesState : "coming-soon";
    const ticketMode = ["zones", "seats"].includes(body.ticketMode) ? body.ticketMode : "general-admission";
    const categories = Array.isArray(body.tickets) ? body.tickets.slice(0, 20) : [];
    const program = Array.isArray(body.program) ? body.program.slice(0, 40) : [];
    const sql = db();

    await sql.begin(async (tx: any) => {
      await tx`
        UPDATE events SET
          title=${title}, starts_at=${startsAt.toISOString()}, ends_at=${endsAt ? endsAt.toISOString() : null},
          age_label=${String(body.ageLabel || "14+")}, city=${String(body.city || "Йошкар-Ола")},
          venue=${String(body.venue || "") || null}, address=${String(body.address || "") || null},
          status=${wantsPublished ? "published" : body.status === "cancelled" ? "cancelled" : "draft"}, sales_state=${salesState}, ticket_mode=${ticketMode},
          hero_image=COALESCE(${String(body.posterImage || "") || null},hero_image), poster_image=COALESCE(${String(body.posterImage || "") || null},poster_image),
          theme_primary=${cleanHex(body.themePrimary, String(current.theme_primary || "#220708"))},
          theme_secondary=${cleanHex(body.themeSecondary, String(current.theme_secondary || "#751013"))},
          theme_accent=${cleanHex(body.themeAccent, String(current.theme_accent || "#e12622"))},
          description=${String(body.description || "")}, secondary_description=${String(body.secondaryDescription || "")}, event_rules=${String(body.eventRules || "")}, updated_at=now()
        WHERE id=${id}
      `;

      const existing = await tx`SELECT c.category_key, COALESCE((SELECT COUNT(*)::int FROM tickets t WHERE t.event_slug=${current.slug} AND t.category_id=c.category_key AND t.status IN ('valid','used')),0)::int AS sold_count FROM event_ticket_categories c WHERE c.event_id=${id}`;
      const incomingKeys: string[] = [];
      for (let i = 0; i < categories.length; i++) {
        const item = categories[i];
        if (!item?.name) continue;
        const categoryKey = keyify(String(item.id || item.name), `ticket-${i + 1}`);
        incomingKeys.push(categoryKey);
        const inventory = item.inventory === "" || item.inventory == null ? null : Math.max(0, Number(item.inventory) || 0);
        const hotEnabled = Boolean(item.hotEnabled);
        const previous = existing.find((row:any) => String(row.category_key) === categoryKey);
        if (inventory != null && previous && Number(previous.sold_count || 0) > inventory) throw new Error(`Нельзя поставить лимит ${inventory}: уже продано ${Number(previous.sold_count || 0)} билетов категории ${String(item.name)}`);
        await tx`
          INSERT INTO event_ticket_categories(event_id,category_key,name,price,note,inventory,hot_enabled,hot_displayed_remaining,theme_primary,theme_secondary,theme_accent,sort_order)
          VALUES(${id},${categoryKey},${String(item.name).trim()},${Math.max(0,Number(item.price)||0)},${String(item.note||"")},${inventory},${hotEnabled},${null},${cleanHex(item.themePrimary,cleanHex(body.themePrimary,"#220708"))},${cleanHex(item.themeSecondary,cleanHex(body.themeSecondary,"#751013"))},${cleanHex(item.themeAccent,cleanHex(body.themeAccent,"#e12622"))},${i})
          ON CONFLICT(event_id,category_key) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,note=EXCLUDED.note,inventory=EXCLUDED.inventory,hot_enabled=EXCLUDED.hot_enabled,hot_displayed_remaining=NULL,theme_primary=EXCLUDED.theme_primary,theme_secondary=EXCLUDED.theme_secondary,theme_accent=EXCLUDED.theme_accent,sort_order=EXCLUDED.sort_order
        `;
      }
      for (const row of existing) {
        const key = String(row.category_key);
        if (!incomingKeys.includes(key)) {
          const used = await tx`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.event_slug=${current.slug} AND oi.ticket_category_id=${key} LIMIT 1`;
          if (!used[0]) await tx`DELETE FROM event_ticket_categories WHERE event_id=${id} AND category_key=${key}`;
        }
      }
      await tx`DELETE FROM event_program_items WHERE event_id=${id}`;
      for (let i = 0; i < program.length; i++) {
        const item = program[i]; const label = String(item?.timeLabel || "").trim(); const titleText = String(item?.title || "").trim();
        if (!titleText) continue;
        await tx`INSERT INTO event_program_items(event_id,time_label,title,sort_order) VALUES(${id},${label},${titleText},${i})`;
      }
    });
    await writeAdminAudit(actor.userId, "event.update", "event", id, { slug: current.slug, title, salesState, status: body.status });
    revalidatePath("/");
    revalidatePath("/events");
    revalidatePath(`/events/${String(current.slug)}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить мероприятие" }, { status });
  }
}
