import Image from "next/image";
import Link from "next/link";
import type { AboutContent } from "@/lib/about-content";

export default function AboutContentView({ content }: { content: AboutContent }) {
  const organizers = content.organizers.filter((person) => person.visible);
  return <div className="about-story">
    <div className="section-label">{content.eyebrow}</div>
    <div className="about-intro-grid">
      <h1 className="inner-title about-story-title">{content.title}</h1>
      <div className="about-copy">
        <p>{content.intro}</p>
        {content.description && <p>{content.description}</p>}
        {content.tags.length > 0 && <div className="tag-row">{content.tags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</div>}
      </div>
    </div>
    <div className="about-statement">{content.statement}</div>
    {organizers.length > 0 && <section className="about-team" aria-label="Организаторы AGAYO">
      <div className="section-label">AGAYO FAMILY / КОМАНДА</div>
      <div className="about-team-heading"><h2>{content.teamTitle}</h2>{content.teamDescription && <p>{content.teamDescription}</p>}</div>
      <div className="about-organizers">{organizers.map((person, index) => <article className="about-organizer" key={person.id}>
        <div className="about-organizer-photo">{person.photoUrl
          ? <Image src={person.photoUrl} alt={person.photoAlt || person.name} fill sizes="(max-width: 650px) 86vw, (max-width: 1050px) 42vw, 28vw" />
          : <span className="about-organizer-initials" aria-hidden="true">{person.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("")}</span>}
          <span className="about-organizer-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        </div>
        {person.role && <div className="about-organizer-role">{person.role}</div>}
        <h3>{person.name}</h3>
        {person.description && <p>{person.description}</p>}
      </article>)}</div>
    </section>}
    <div className="about-story-cta"><span>Увидимся на следующем вечере.</span><Link className="text-link" href="/events">Выбрать событие <span aria-hidden="true">↗</span></Link></div>
  </div>;
}
