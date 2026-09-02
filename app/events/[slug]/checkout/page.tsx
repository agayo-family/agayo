import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CheckoutExperience from "@/components/CheckoutExperience";
import { getEvent } from "@/lib/events";

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const event = getEvent(slug);
  if (!event || event.salesState !== "open" || event.tickets.length === 0) notFound();
  if (!event) return null;
  return <main className="inner-page checkout-page"><SiteHeader /><section className="checkout-shell"><div className="section-label">ПОКУПКА / {event.title}</div><CheckoutExperience event={event} initialCategory={query.category} /></section></main>;
}
