import Image from "next/image";
import Link from "next/link";
import MobileNav from "./MobileNav";

export default function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? "site-header" : "inner-header"}>
      <Link className="brand-logo" href="/" aria-label="AGAYO — главная">
        <Image src="/agayo-logo.svg" alt="AGAYO" width={118} height={32} priority />
      </Link>
      {overlay ? (
        <>
          <nav className="desktop-nav" aria-label="Основная навигация">
            <Link href="/events">Мероприятия</Link>
            <Link href="/gallery">Галерея</Link>
          </nav>
          <Link className="profile-link" href="/profile">Профиль</Link>
          <MobileNav />
        </>
      ) : (
        <nav className="inner-nav" aria-label="Основная навигация">
          <Link href="/events">Мероприятия</Link>
          <Link href="/gallery">Галерея</Link>
          <Link href="/profile">Профиль</Link>
        </nav>
      )}
    </header>
  );
}
