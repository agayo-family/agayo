import { notFound } from "next/navigation";
import QRCode from "qrcode";
import SiteHeader from "@/components/SiteHeader";
import LiveTicket from "@/components/LiveTicket";
import { db } from "@/lib/server/db";
import { getEventServer } from "@/lib/server/events";
import { personalTicketDescriptions } from '@/lib/server/personal-ticket-store';

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.DATABASE_URL) notFound();
  const rows = await db()`SELECT public_id,qr_token,status,owner_name,category_id,category_name,zone,seat,event_slug FROM tickets WHERE qr_token=${token} LIMIT 1`;
  const ticket = rows[0];
  if (!ticket) notFound();
  const storedEvent = await getEventServer(String(ticket.event_slug));
  if (!storedEvent) notFound();
  const categoryTheme = storedEvent.tickets.find(category => category.id === String(ticket.category_id))?.theme;
  const event = categoryTheme ? { ...storedEvent, ticketTheme: categoryTheme } : storedEvent;
  const personal = (await personalTicketDescriptions(db(), [String(ticket.public_id)])).get(String(ticket.public_id));
  const qrDataUrl = await QRCode.toDataURL(`AGAYO-TICKET:${ticket.qr_token}`, { margin: 1, width: 520, color: { dark: "#260607", light: "#f5e9e3" } });
  return <main id="main-content" className="inner-page ticket-page"><SiteHeader /><section className="ticket-page-shell"><div className="ticket-page-heading"><div><div className="section-label">04 / БИЛЕТ</div><p>ТВОЙ ВХОД ВНУТРЬ</p></div></div><LiveTicket ticket={{ publicId: ticket.public_id, qrDataUrl, status: ticket.status, ownerName: ticket.owner_name, categoryName: ticket.category_name, zone: ticket.zone, seat: ticket.seat, eventSlug: ticket.event_slug, personalTitle: personal?.title, personalDescription: personal?.description }} event={event} /></section></main>;
}
