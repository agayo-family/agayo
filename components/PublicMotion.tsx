"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TARGETS = "h2, [data-reveal], .landing-agenda-card, .landing-photo, .event-list-item, .gallery-editorial-card, .ticket-card, .about-organizer, .about-statement";

export default function PublicMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(?:admin(?:-preview)?|auth|profile|tickets)(?:\/|$)/.test(pathname) || /\/checkout(?:\/|$)/.test(pathname)) return;
    const main = document.getElementById("main-content");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!main || preference.matches || !("IntersectionObserver" in window)) return;
    const nodes = Array.from(main.querySelectorAll<HTMLElement>(TARGETS));
    // Read geometry before writing classes. Content is visible without JavaScript.
    const belowFold = nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.height > 0 && box.top >= window.innerHeight - 16;
    });
    const observer = new IntersectionObserver((entries) => {
      let stagger = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        node.style.setProperty("--reveal-delay", `${Math.min(stagger++ * 65, 195)}ms`);
        node.classList.remove("agayo-motion-pending");
        node.classList.add("agayo-motion-enter");
        observer.unobserve(node);
      }
    }, { threshold: 0, rootMargin: "0px 0px -5% 0px" });
    for (const node of belowFold) {
      node.classList.add("agayo-motion-pending");
      observer.observe(node);
    }
    const revealFocused = (event: FocusEvent) => {
      const node = event.target instanceof Element ? event.target.closest<HTMLElement>(".agayo-motion-pending") : null;
      if (!node) return;
      node.classList.remove("agayo-motion-pending");
      observer.unobserve(node);
    };
    const clear = () => {
      observer.disconnect();
      for (const node of nodes) {
        node.classList.remove("agayo-motion-pending", "agayo-motion-enter");
        node.style.removeProperty("--reveal-delay");
      }
    };
    const onPreference = () => { if (preference.matches) clear(); };
    main.addEventListener("focusin", revealFocused);
    preference.addEventListener("change", onPreference);
    return () => {
      main.removeEventListener("focusin", revealFocused);
      preference.removeEventListener("change", onPreference);
      clear();
    };
  }, [pathname]);
  return null;
}
