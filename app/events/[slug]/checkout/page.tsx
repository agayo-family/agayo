import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getEvent } from "@/lib/events";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getEvent(slug);
  if (!event || event.salesState !== "open") notFound();
  return (
    <main className="inner-page">
      <SiteHeader />
      <div className="inner-wrap ticket-placeholder">
        <div className="section-label">ПОКУПКА / {event.title}</div>
        <h1 className="inner-title">ПОКУПКА<br />БИЛЕТА</h1>
        <p className="inner-lead">Этот маршрут уже выделен правильно, но реальные заказ, бронь, Email-вход и ЮKassa будут подключены вместе с backend, чтобы не имитировать оплату на клиенте.</p>
        <Link className="button-link" href={`/events/${event.slug}`}>Вернуться к событию <span>↗</span></Link>
      </div>
    </main>
  );
}
