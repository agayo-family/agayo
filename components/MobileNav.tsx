"use client";

import Link from "next/link";
import { useState } from "react";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-nav-wrap">
      <button className="menu-button" type="button" aria-expanded={open} aria-label="Открыть меню" onClick={() => setOpen((value) => !value)}>
        <span /><span />
      </button>
      {open && (
        <nav className="mobile-nav" aria-label="Мобильная навигация">
          <Link href="/events" onClick={() => setOpen(false)}>Мероприятия</Link>
          <Link href="/gallery" onClick={() => setOpen(false)}>Галерея</Link>
          <Link href="/profile" onClick={() => setOpen(false)}>Профиль</Link>
        </nav>
      )}
    </div>
  );
}
