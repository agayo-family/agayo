import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { LEGAL_VERSION, ORGANIZER } from "@/lib/legal";

export const metadata = { title: "Правовая информация — AGAYO" };

export default function LegalPage() {
  return (
    <main className="inner-page">
      <SiteHeader />
      <div className="inner-wrap legal-doc">
        <div className="section-label">ПРАВОВАЯ ИНФОРМАЦИЯ · РЕДАКЦИЯ {LEGAL_VERSION}</div>
        <h1 className="inner-title">AGAYO / LEGAL</h1>
        <div className="legal-intro">
          <p><strong>Организатор:</strong> {ORGANIZER.name}</p>
          <p>ОГРНИП {ORGANIZER.ogrnip} · ИНН {ORGANIZER.inn}</p>
          <p>Место осуществления деятельности: {ORGANIZER.city}</p>
        </div>
        <nav className="legal-nav">
          <Link href="/legal/offer">Публичная оферта <span>↗</span></Link>
          <Link href="/legal/user-agreement">Пользовательское соглашение <span>↗</span></Link>
          <Link href="/legal/privacy">Политика и согласие на обработку данных <span>↗</span></Link>
        </nav>
        <p className="legal-footnote">Правила конкретного мероприятия публикуются на странице этого события и показываются покупателю перед оплатой.</p>
      </div>
    </main>
  );
}
