import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CheckoutExperience from "@/components/CheckoutExperience";
import { getEventServer } from "@/lib/server/events";
import { getEventCatalogBadge } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const event = await getEventServer(slug);
  if (!event || event.status !== "published" || getEventCatalogBadge(event) !== "tickets" || event.tickets.filter((ticket) => !ticket.soldOut).length === 0) notFound();
  if (!event) return null;
  return <main className="inner-page checkout-page"><SiteHeader /><section className="checkout-shell"><div className="section-label">ПОКУПКА / {event.title}</div><CheckoutExperience event={event} initialCategory={query.category} /></section></main>;
}
