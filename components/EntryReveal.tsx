"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

const INTRO_MS = 2600;

export default function EntryReveal() {
  const pathname = usePathname();
  const [finished, setFinished] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const privateFlow = /^\/(?:admin(?:-preview)?|auth|profile|tickets)(?:\/|$)/.test(pathname) || /\/checkout(?:\/|$)/.test(pathname);

  useEffect(() => {
    if (finished || privateFlow) return;
    const element = overlay.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || getComputedStyle(element).visibility === "hidden") {
      setFinished(true); return;
    }
    const main = document.querySelector<HTMLElement>("#main-content");
    const previousInert = main?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    // CSS starts at first paint. Hydration never adds another 2.6 seconds.
    const elapsed = Number(element.getAnimations()[0]?.currentTime ?? 0);
    const timer = window.setTimeout(() => setFinished(true), Math.max(0, INTRO_MS - elapsed) + 100);
    return () => {
      window.clearTimeout(timer);
      if (main) main.inert = previousInert;
      document.body.style.overflow = previousOverflow;
    };
  }, [finished, privateFlow]);

  if (finished || privateFlow) return null;
  return <div ref={overlay} className="agayo-entry-reveal" role="region" aria-label="Вступление AGAYO" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setFinished(true); }}>
    <div className="agayo-entry-halo" aria-hidden="true" />
    <div className="agayo-entry-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--ray": index } as CSSProperties} />)}</div>
    <div className="agayo-entry-art-frame" aria-hidden="true"><svg className="agayo-entry-art" viewBox="0 0 1000 600" focusable="false">
      <defs>
        <linearGradient id="agayo-intro-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#390718" /><stop offset=".24" stopColor="#8d1436" /><stop offset=".52" stopColor="#d22348" /><stop offset=".78" stopColor="#ff4d52" /><stop offset="1" stopColor="#ff9a88" /></linearGradient>
        <radialGradient id="agayo-intro-light"><stop stopColor="#ff7567" /><stop offset=".65" stopColor="#d5203d" /><stop offset="1" stopColor="#5c0c27" /></radialGradient>
        <mask id="agayo-intro-shape" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600" style={{ maskType: "alpha" }}>
          <ellipse className="agayo-entry-cloud-mask" cx="500" cy="300" rx="465" ry="268" fill="white" />
          <image href="/agayo-logo-mask.png" x="225" y="169.5" width="550" height="261" />
        </mask>
      </defs>
      <g mask="url(#agayo-intro-shape)">
        <rect width="1000" height="600" fill="url(#agayo-intro-red)" />
        <ellipse className="agayo-entry-color-wave" cx="730" cy="280" rx="470" ry="330" fill="url(#agayo-intro-light)" opacity=".8" />
      </g>
    </svg></div>
    <div className="agayo-entry-caption" aria-hidden="true"><span>AGAYO FAMILY</span><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span></div>
    <button className="agayo-entry-skip" type="button" onClick={() => setFinished(true)}>Пропустить <span aria-hidden="true">↗</span></button>
  </div>;
}
