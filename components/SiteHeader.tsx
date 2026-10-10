import Link from "next/link";
import NavigationLink from "./NavigationLink";
import MobileNav from "./MobileNav";

export default function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return <header className={overlay ? "site-header" : "inner-header"}>
    <a className="skip-link" href="#main-content">К содержимому</a>
    <Link className="brand-logo" href="/" aria-label="AGAYO — главная"><span className="brand-logo-mark" aria-hidden="true" /></Link>
    <nav className={overlay ? "desktop-nav" : "inner-nav desktop-nav"} aria-label="Основная навигация"><NavigationLink href="/events">Мероприятия</NavigationLink><NavigationLink href="/gallery">Галерея</NavigationLink>{!overlay && <NavigationLink href="/profile" prefetch={false}>Профиль</NavigationLink>}</nav>
    {overlay && <Link className="profile-link" href="/profile" prefetch={false}>Профиль</Link>}
    <MobileNav />
  </header>;
}
