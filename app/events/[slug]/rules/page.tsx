import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { DEFAULT_EVENT_RULES } from "@/lib/legal";
import { getEventServer } from "@/lib/server/events";
import { canAccessEvent, getCurrentAdminAccess, hasPermission } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export default async function EventRulesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const event = await getEventServer(slug);
  if (!event) notFound();

  let adminPreview = false;
  if (event.status !== "published" && query.preview === "admin") {
    const access = await getCurrentAdminAccess();
    adminPreview = Boolean(access && hasPermission(access, "manage_events") && canAccessEvent(access, event.slug));
  }
  if (event.status !== "published" && !adminPreview) notFound();

  const rules = (event.eventRules || "").trim() || DEFAULT_EVENT_RULES;

  return (
    <main className="inner-page">
      <SiteHeader />
      <article className="inner-wrap legal-doc event-rules-doc">
        <div className="section-label">ПРАВИЛА МЕРОПРИЯТИЯ · {event.dateLabel}</div>
        <h1 className="legal-title">{event.title}</h1>
        {adminPreview ? <p className="legal-preview-note">ПРЕДПРОСМОТР ЧЕРНОВИКА</p> : null}
        <div className="event-rules-copy">{rules}</div>
        <p className="legal-footnote">Эти правила дополняют Публичную оферту AGAYO и применяются к данному мероприятию.</p>
      </article>
    </main>
  );
}
