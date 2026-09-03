import { db } from "./db";
import { AgayoEvent, events as staticEvents } from "../events";

function fmtDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Moscow" }).format(value);
}
function fmtTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Moscow" }).format(value);
}

function eventFromRow(row: any, tickets: any[], program: any[], reservedByCategory: Map<string, number>): AgayoEvent {
  const start = new Date(row.starts_at as string);
  const end = row.ends_at ? new Date(row.ends_at as string) : null;
  const eventSlug = String(row.slug);

  return {
    slug: eventSlug,
    title: String(row.title),
    dateLabel: fmtDate(start),
    startsAt: start.toISOString(),
    timeLabel: end ? `${fmtTime(start)}—${fmtTime(end)}` : fmtTime(start),
    ageLabel: String(row.age_label),
    city: String(row.city),
    alcoholFree: Boolean(row.alcohol_free),
    status: String(row.status) as AgayoEvent["status"],
    salesState: String(row.sales_state) as AgayoEvent["salesState"],
    ticketMode: String(row.ticket_mode) as AgayoEvent["ticketMode"],
    heroImage: String(row.hero_image || row.poster_image || "/events/vernite-lampovost-poster.jpg"),
    posterImage: row.poster_image ? String(row.poster_image) : undefined,
    ticketTheme: {
      primary: String(row.theme_primary || "#220708"),
      secondary: String(row.theme_secondary || "#751013"),
      accent: String(row.theme_accent || "#e12622"),
    },
    description: String(row.description || ""),
    secondaryDescription: String(row.secondary_description || ""),
    tickets: tickets
      .filter((ticket) => String(ticket.event_id) === String(row.id))
      .map((ticket) => {
        const inventory = ticket.inventory == null ? null : Number(ticket.inventory);
        const sold = Number(ticket.sold_count) || 0;
        const reserved = reservedByCategory.get(`${eventSlug}:${String(ticket.category_key)}`) || 0;
        const remaining = inventory == null ? null : Math.max(0, inventory - sold - reserved);
        return {
          id: String(ticket.category_key),
          name: String(ticket.name),
          price: Number(ticket.price),
          note: String(ticket.note || ""),
          inventory,
          remaining,
          soldOut: remaining === 0,
          hotTickets:
            ticket.hot_enabled && remaining != null && remaining > 0 && remaining < 5
              ? { enabled: true, displayedRemaining: remaining as 1 | 2 | 3 | 4 }
              : undefined,
          theme: ticket.theme_primary
            ? {
                primary: String(ticket.theme_primary),
                secondary: String(ticket.theme_secondary || row.theme_secondary || "#751013"),
                accent: String(ticket.theme_accent || row.theme_accent || "#e12622"),
              }
            : undefined,
        };
      }),
    program: program
      .filter((item) => String(item.event_id) === String(row.id))
      .map((item) => [String(item.time_label), String(item.title)] as [string, string]),
  };
}

async function loadDbEvents(): Promise<AgayoEvent[]> {
  if (!process.env.DATABASE_URL) return [];
  const sql = db();

  let rows: any[] = [];
  try {
    rows = (await sql`SELECT * FROM events ORDER BY starts_at DESC`) as any[];
  } catch (error) {
    console.warn("Events DB rows:", error instanceof Error ? error.message : error);
    return [];
  }
  if (!rows.length) return [];

  // Child tables are deliberately loaded independently. A missing/older optional
  // table must never make an existing event disappear and turn its public route into 404.
  let tickets: any[] = [];
  let program: any[] = [];
  const reservedByCategory = new Map<string, number>();

  try {
    tickets = (await sql`
      SELECT c.*,
        COALESCE((
          SELECT COUNT(*)::int
          FROM tickets t
          JOIN events event_for_ticket ON event_for_ticket.id=c.event_id
          WHERE t.event_slug=event_for_ticket.slug
            AND t.category_id=c.category_key
            AND t.status IN ('valid','used')
        ),0)::int AS sold_count
      FROM event_ticket_categories c
      ORDER BY c.event_id, c.sort_order, c.name
    `) as any[];
  } catch (error) {
    console.warn("Event categories unavailable:", error instanceof Error ? error.message : error);
  }

  try {
    const reservations = (await sql`
      SELECT event_slug, category_id, COALESCE(SUM(quantity),0)::int AS reserved_count
      FROM ticket_inventory_reservations
      WHERE consumed_at IS NULL AND released_at IS NULL
      GROUP BY event_slug, category_id
    `) as any[];
    for (const row of reservations) {
      reservedByCategory.set(`${String(row.event_slug)}:${String(row.category_id)}`, Number(row.reserved_count) || 0);
    }
  } catch (error) {
    // Inventory reservations were introduced after the first event schema. Public
    // event pages should still render if that migration has not been applied yet.
    console.warn("Event reservations unavailable:", error instanceof Error ? error.message : error);
  }

  try {
    program = (await sql`
      SELECT p.* FROM event_program_items p ORDER BY p.event_id, p.sort_order
    `) as any[];
  } catch (error) {
    console.warn("Event program unavailable:", error instanceof Error ? error.message : error);
  }

  return rows.map((row) => eventFromRow(row, tickets, program, reservedByCategory));
}

async function loadDbEventBySlug(slug: string): Promise<AgayoEvent | null> {
  if (!process.env.DATABASE_URL) return null;
  const sql = db();
  let row: any;
  try {
    const rows = await sql`SELECT * FROM events WHERE slug=${slug} LIMIT 1`;
    row = rows[0];
  } catch (error) {
    console.warn("Event DB lookup:", error instanceof Error ? error.message : error);
    return null;
  }
  if (!row) return null;

  let tickets: any[] = [];
  let program: any[] = [];
  const reservedByCategory = new Map<string, number>();

  try {
    tickets = (await sql`
      SELECT c.*,
        COALESCE((
          SELECT COUNT(*)::int FROM tickets t
          WHERE t.event_slug=${slug}
            AND t.category_id=c.category_key
            AND t.status IN ('valid','used')
        ),0)::int AS sold_count
      FROM event_ticket_categories c
      WHERE c.event_id=${String(row.id)}
      ORDER BY c.sort_order, c.name
    `) as any[];
  } catch (error) {
    console.warn(`Categories for ${slug}:`, error instanceof Error ? error.message : error);
  }

  try {
    const reservations = (await sql`
      SELECT category_id, COALESCE(SUM(quantity),0)::int AS reserved_count
      FROM ticket_inventory_reservations
      WHERE event_slug=${slug} AND consumed_at IS NULL AND released_at IS NULL
      GROUP BY category_id
    `) as any[];
    for (const item of reservations) {
      reservedByCategory.set(`${slug}:${String(item.category_id)}`, Number(item.reserved_count) || 0);
    }
  } catch (error) {
    console.warn(`Reservations for ${slug}:`, error instanceof Error ? error.message : error);
  }

  try {
    program = (await sql`
      SELECT p.* FROM event_program_items p
      WHERE p.event_id=${String(row.id)}
      ORDER BY p.sort_order
    `) as any[];
  } catch (error) {
    console.warn(`Program for ${slug}:`, error instanceof Error ? error.message : error);
  }

  return eventFromRow(row, tickets, program, reservedByCategory);
}

export async function getAllEventsServer() {
  const stored = await loadDbEvents();
  if (!stored.length) return staticEvents;
  const known = new Set(stored.map((event) => event.slug));
  return [...stored, ...staticEvents.filter((event) => !known.has(event.slug))];
}

export async function getPublishedEventsServer() {
  return (await getAllEventsServer()).filter((event) => event.status === "published");
}

export async function getEventServer(slug: string) {
  // Dynamic segments can arrive URL-encoded when a title produced a Cyrillic slug.
  // Normalize before the exact PostgreSQL lookup so /events/<new-slug> is reliable.
  let normalizedSlug = slug;
  try { normalizedSlug = decodeURIComponent(slug); } catch {}

  // Public event routes resolve the requested slug directly from PostgreSQL.
  // An unrelated child-table problem can no longer hide the parent event.
  const stored = await loadDbEventBySlug(normalizedSlug);
  if (stored) return stored;
  return staticEvents.find((event) => event.slug === normalizedSlug);
}

export async function getUpcomingEventServer() {
  return (await getAllEventsServer())
    .filter((event) => event.status === "published" && event.salesState === "open")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
}
