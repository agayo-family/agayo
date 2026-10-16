import { db } from './db';
import { sendTicketEmail, type TicketEmailInput } from './email';
import type { AgayoEvent } from '../events';

export async function deliverPersonalBatch(campaignId: string, event: AgayoEvent, baseUrl: string) {
  const sql = db();
  const claims = await sql.begin(async tx => {
    const rows = await tx`SELECT g.id AS grant_id,g.email_payload,t.public_id,t.qr_token,t.owner_name,t.category_id,t.category_name,t.zone,t.seat,t.id AS ticket_id,d.id AS delivery_id,d.destination,c.title,c.description
      FROM personal_ticket_grants g JOIN personal_ticket_campaigns c ON c.id=g.campaign_id
      JOIN tickets t ON t.id=g.ticket_id JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
      WHERE g.campaign_id=${campaignId} AND d.status <> 'sent' AND t.status='valid'
      AND (g.delivery_claim_until IS NULL OR g.delivery_claim_until < now())
      ORDER BY g.created_at,g.id LIMIT 10 FOR UPDATE OF g SKIP LOCKED`;
    for (const row of rows) {
      let frozen = row.email_payload;
      if (typeof frozen === 'string') {
        try { frozen = JSON.parse(frozen); } catch { frozen = null; }
      }
      const payload: TicketEmailInput = frozen && typeof frozen === 'object' ? frozen : {
        eventTitle: event.title, eventSlug: event.slug, eventDate: event.dateLabel, eventTime: event.timeLabel,
        eventCity: event.city, eventAge: event.ageLabel, alcoholFree: event.alcoholFree,
        ticketId: String(row.public_id), ticketUrl: `${baseUrl}/tickets/${row.qr_token}`, qrToken: String(row.qr_token),
        ownerName: String(row.owner_name), categoryName: String(row.category_name),
        zone: row.zone ? String(row.zone) : null, seat: row.seat ? String(row.seat) : null,
        posterUrl: new URL(event.posterImage || event.heroImage, baseUrl).href, theme: event.tickets.find(category => category.id === String(row.category_id))?.theme || event.ticketTheme,
        personalTitle: String(row.title), personalDescription: String(row.description), deliveryKey: `AGAYO-PERSONAL-${row.grant_id}`,
      };
      await tx`UPDATE personal_ticket_grants SET delivery_claim_until=now()+interval '2 minutes',email_payload=${JSON.stringify(payload)}::text::jsonb WHERE id=${row.grant_id}`;
      row.payload = payload;
    }
    return rows;
  });
  let sent = 0, failed = 0;
  // Network delivery occurs outside the SQL transaction and pool lock.
  async function deliver(claim: (typeof claims)[number]) {
    try {
      await sendTicketEmail(String(claim.destination), claim.payload);
      await sql`UPDATE ticket_deliveries SET status='sent',sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=${claim.delivery_id}`;
      sent++;
    } catch {
      const changed = await sql`UPDATE ticket_deliveries SET status='failed',attempts=attempts+1,last_error='Email delivery failed; retry from personal tickets' WHERE id=${claim.delivery_id} AND status <> 'sent' RETURNING id`;
      if (changed.length) failed++;
    } finally {
      await sql`UPDATE personal_ticket_grants SET delivery_claim_until=NULL WHERE id=${claim.grant_id}`;
    }
  }
  // Two concurrent provider calls keep a ten-ticket batch within the function
  // duration even if the provider is slow, without flooding its rate limit.
  for (let index = 0; index < claims.length; index += 2) {
    await Promise.all(claims.slice(index, index + 2).map(deliver));
  }
  return { sent, failed };
}
