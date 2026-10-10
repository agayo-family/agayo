import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function NotFound() {
  return <main id="main-content" className="inner-page"><SiteHeader /><div className="agayo-error-page"><span className="section-label">404 / AGAYO</span><h1>ВЕЧЕР<br />НЕ НАЙДЕН</h1><p>Возможно, ссылка устарела или мероприятие ещё не опубликовано.</p><Link className="button-link button-link-accent" href="/events">Все мероприятия <span>↗</span></Link></div></main>;
}
