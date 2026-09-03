import { db } from "./db";
import { AgayoEvent, events as staticEvents } from "../events";

function fmtDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Moscow" }).format(value);
}
function fmtTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Moscow" }).format(value);
}

async function dbEvents(): Promise<AgayoEvent[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const sql = db();
    const rows = await sql`SELECT * FROM events ORDER BY starts_at DESC`;
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const tickets = await sql`SELECT * FROM event_ticket_categories WHERE event_id = ANY(${ids}) ORDER BY sort_order`;
    const program = await sql`SELECT * FROM event_program_items WHERE event_id = ANY(${ids}) ORDER BY sort_order`;
    return rows.map((row) => {
      const start = new Date(row.starts_at as string);
      const end = row.ends_at ? new Date(row.ends_at as string) : null;
      return {
        slug: String(row.slug), title: String(row.title), dateLabel: fmtDate(start), startsAt: start.toISOString(),
        timeLabel: end ? `${fmtTime(start)}—${fmtTime(end)}` : fmtTime(start), ageLabel: String(row.age_label), city: String(row.city),
        alcoholFree: Boolean(row.alcohol_free), status: String(row.status) as AgayoEvent["status"], salesState: String(row.sales_state) as AgayoEvent["salesState"],
        ticketMode: String(row.ticket_mode) as AgayoEvent["ticketMode"], heroImage: String(row.hero_image || row.poster_image || "/events/vernite-lampovost-poster.jpg"),
        posterImage: row.poster_image ? String(row.poster_image) : undefined,
        ticketTheme: { primary: String(row.theme_primary), secondary: String(row.theme_secondary), accent: String(row.theme_accent) },
        description: String(row.description || ""), secondaryDescription: String(row.secondary_description || ""),
        tickets: tickets.filter((t) => String(t.event_id) === String(row.id)).map((t) => ({
          id: String(t.category_key), name: String(t.name), price: Number(t.price), note: String(t.note || ""),
          hotTickets: t.hot_enabled && t.hot_displayed_remaining ? { enabled: true, displayedRemaining: Number(t.hot_displayed_remaining) as 1|2|3|4 } : undefined,
          theme: t.theme_primary ? { primary: String(t.theme_primary), secondary: String(t.theme_secondary), accent: String(t.theme_accent) } : undefined,
        })),
        program: program.filter((p) => String(p.event_id) === String(row.id)).map((p) => [String(p.time_label), String(p.title)] as [string,string]),
      };
    });
  } catch (error) {
    console.warn("Events DB fallback:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getAllEventsServer() {
  const stored = await dbEvents();
  if (!stored.length) return staticEvents;
  const known = new Set(stored.map((event) => event.slug));
  return [...stored, ...staticEvents.filter((event) => !known.has(event.slug))];
}
export async function getPublishedEventsServer() { return (await getAllEventsServer()).filter((event) => event.status === "published"); }
export async function getEventServer(slug: string) { return (await getAllEventsServer()).find((event) => event.slug === slug); }
export async function getUpcomingEventServer() { return (await getAllEventsServer()).filter((event) => event.status === "published" && event.salesState === "open").sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0]; }
