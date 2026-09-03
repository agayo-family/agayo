import { events as staticEvents } from "@/lib/events";
import { db } from "./db";

function endIso(startsAt: string, timeLabel: string) {
  const end = timeLabel.includes("—") ? timeLabel.split("—")[1]?.trim() : "";
  if (!end) return null;
  const value = new Date(`${startsAt.slice(0, 10)}T${end}:00+03:00`);
  return Number.isNaN(value.valueOf()) ? null : value.toISOString();
}

/**
 * Copies the built-in AGAYO events into PostgreSQL once, without overwriting
 * anything the owner has already edited in /admin.
 */
export async function ensureSeedEvents() {
  if (!process.env.DATABASE_URL) return;
  const sql = db();

  for (const event of staticEvents) {
    await sql.begin(async (tx: any) => {
      const inserted = await tx`
        INSERT INTO events(
          slug,title,starts_at,ends_at,age_label,city,alcohol_free,status,sales_state,ticket_mode,
          hero_image,poster_image,theme_primary,theme_secondary,theme_accent,description,secondary_description
        )
        VALUES(
          ${event.slug},${event.title},${new Date(event.startsAt).toISOString()},${endIso(event.startsAt,event.timeLabel)},
          ${event.ageLabel},${event.city},${event.alcoholFree},${event.status},${event.salesState},${event.ticketMode},
          ${event.heroImage},${event.posterImage ?? null},${event.ticketTheme?.primary ?? "#220708"},
          ${event.ticketTheme?.secondary ?? "#751013"},${event.ticketTheme?.accent ?? "#e12622"},
          ${event.description},${event.secondaryDescription}
        )
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `;

      // Only seed children when the parent itself has just been inserted.
      // Later admin edits (including deleting all program items) are respected.
      if (!inserted[0]) return;
      const eventId = String(inserted[0].id);

      for (let index = 0; index < event.tickets.length; index++) {
        const ticket = event.tickets[index];
        await tx`
          INSERT INTO event_ticket_categories(
            event_id,category_key,name,price,note,inventory,hot_enabled,hot_displayed_remaining,
            theme_primary,theme_secondary,theme_accent,sort_order
          ) VALUES(
            ${eventId},${ticket.id},${ticket.name},${ticket.price},${ticket.note},${ticket.inventory ?? null},
            ${Boolean(ticket.hotTickets?.enabled)},${ticket.hotTickets?.displayedRemaining ?? null},
            ${ticket.theme?.primary ?? event.ticketTheme?.primary ?? null},
            ${ticket.theme?.secondary ?? event.ticketTheme?.secondary ?? null},
            ${ticket.theme?.accent ?? event.ticketTheme?.accent ?? null},${index}
          )
        `;
      }

      for (let index = 0; index < event.program.length; index++) {
        const [timeLabel, title] = event.program[index];
        await tx`
          INSERT INTO event_program_items(event_id,time_label,title,sort_order)
          VALUES(${eventId},${timeLabel},${title},${index})
        `;
      }
    });
  }
}
