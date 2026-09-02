import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import TicketExperience from "@/components/TicketExperience";

export default function DemoTicketPage() {
  return (
    <main className="inner-page ticket-page">
      <SiteHeader />
      <section className="ticket-page-shell">
        <div className="ticket-page-heading">
          <div>
            <div className="section-label">04 / БИЛЕТ</div>
            <p>ТВОЙ ВХОД ВНУТРЬ</p>
          </div>
          <Link href="/profile">← В профиль</Link>
        </div>
        <TicketExperience />
      </section>
    </main>
  );
}
