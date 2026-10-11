"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="mobile-nav-wrap" ref={root}>
    <button ref={trigger} className={`menu-button ${open ? "is-open" : ""}`} type="button" aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? "Закрыть меню" : "Открыть меню"} onClick={() => setOpen((value) => !value)}><span /><span /></button>
    {open && <nav id="mobile-navigation" className="mobile-nav" aria-label="Мобильная навигация"><Link href="/events" onClick={() => setOpen(false)}>Мероприятия</Link><Link href="/gallery" onClick={() => setOpen(false)}>Галерея</Link><Link href="/about" onClick={() => setOpen(false)}>О нас</Link><Link href="/profile" prefetch={false} onClick={() => setOpen(false)}>Профиль</Link></nav>}
  </div>;
}
