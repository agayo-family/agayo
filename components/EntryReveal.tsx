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
  return <div ref={overlay} className="agayo-entry-reveal" data-intro-style="industrial" role="region" aria-label="Вступление AGAYO" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setFinished(true); }}>
    <div className="agayo-entry-grid" aria-hidden="true" />
    <div className="agayo-entry-halo" aria-hidden="true" />
    <div className="agayo-entry-chassis" aria-hidden="true"><i /><i /><i /><i /><span /><span /></div>
    <div className="agayo-entry-wavefront" aria-hidden="true" />
    <div className="agayo-entry-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--ray": index } as CSSProperties} />)}</div>
    <div className="agayo-entry-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--spark": index } as CSSProperties} />)}</div>
    <div className="agayo-entry-art-frame" aria-hidden="true"><svg className="agayo-entry-art" viewBox="0 0 1000 600" focusable="false">
      <defs>
        <linearGradient id="agayo-intro-red" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#260812" /><stop offset=".2" stopColor="#74122f" /><stop offset=".43" stopColor="#b01a3b" /><stop offset=".64" stopColor="#ed354e" /><stop offset=".84" stopColor="#ff8069" /><stop offset="1" stopColor="#651229" /></linearGradient>
        <radialGradient id="agayo-intro-light"><stop stopColor="#f86463" /><stop offset=".5" stopColor="#d12449" /><stop offset="1" stopColor="#741539" stopOpacity="0" /></radialGradient>
        <radialGradient id="agayo-intro-wine"><stop stopColor="#521035" /><stop offset=".55" stopColor="#3a0a23" /><stop offset="1" stopColor="#240812" stopOpacity="0" /></radialGradient>
        <radialGradient id="agayo-intro-heat"><stop stopColor="#f6af91" /><stop offset=".32" stopColor="#f36164" /><stop offset="1" stopColor="#e73851" stopOpacity="0" /></radialGradient>
        <linearGradient id="agayo-intro-metal" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#10070c" stopOpacity=".45" /><stop offset=".3" stopColor="#61132d" stopOpacity=".1" /><stop offset=".485" stopColor="#ffc1a9" stopOpacity=".17" /><stop offset=".51" stopColor="#ffe0c0" stopOpacity=".28" /><stop offset=".55" stopColor="#3b081d" stopOpacity=".35" /><stop offset=".82" stopColor="#130810" stopOpacity=".42" /><stop offset="1" stopColor="#d54450" stopOpacity=".1" /></linearGradient>
        <linearGradient id="agayo-intro-shine"><stop stopColor="#ffdbc3" stopOpacity="0" /><stop offset=".36" stopColor="#ffdbc3" stopOpacity="0" /><stop offset=".5" stopColor="#ffe0c8" stopOpacity=".42" /><stop offset=".64" stopColor="#ffdbc3" stopOpacity="0" /><stop offset="1" stopColor="#ffdbc3" stopOpacity="0" /></linearGradient>
        <pattern id="agayo-intro-brushed" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6" stroke="#260913" strokeOpacity=".2" /><path d="M0 3H6" stroke="#ffd0bc" strokeOpacity=".065" /></pattern>
        <mask id="agayo-intro-shape" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600" style={{ maskType: "alpha" }}>
          <ellipse className="agayo-entry-cloud-mask" cx="500" cy="300" rx="465" ry="268" fill="white" />
          <image href="/agayo-logo-mask.png" x="225" y="169.5" width="550" height="261" />
        </mask>
      </defs>
      <g className="agayo-entry-chamber" fill="none" stroke="#c45b67" strokeWidth="1"><path d="M68 172 146 94H854L932 172V428L854 506H146L68 428Z" /><path d="M96 212 169 132H831L904 212M96 388 169 468H831L904 388" opacity=".38" /><path d="M42 300H178M822 300H958M500 42V112M500 488V558" opacity=".55" /></g>
      <g mask="url(#agayo-intro-shape)">
        <rect width="1000" height="600" fill="url(#agayo-intro-red)" />
        <ellipse className="agayo-entry-color-wave" cx="650" cy="280" rx="500" ry="350" fill="url(#agayo-intro-light)" />
        <ellipse className="agayo-entry-undertow" cx="340" cy="300" rx="430" ry="320" fill="url(#agayo-intro-wine)" />
        <ellipse className="agayo-entry-heat-wave" cx="660" cy="200" rx="310" ry="240" fill="url(#agayo-intro-heat)" />
        <rect width="1000" height="600" fill="url(#agayo-intro-metal)" />
        <rect width="1000" height="600" fill="url(#agayo-intro-brushed)" />
        <g className="agayo-entry-specular"><rect x="-550" y="-250" width="650" height="1100" fill="url(#agayo-intro-shine)" /></g>
      </g>
    </svg><div className="agayo-entry-glints"><i /><i /></div></div>
    <div className="agayo-entry-caption" aria-hidden="true"><span>AGAYO FAMILY</span><span>ПРОЖИВИ ЭТОТ ВЕЧЕР</span></div>
    <button className="agayo-entry-skip" type="button" onClick={() => setFinished(true)}>Пропустить <span aria-hidden="true">↗</span></button>
  </div>;
}
