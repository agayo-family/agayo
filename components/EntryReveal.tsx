'use client';
import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { usePathname } from 'next/navigation';

function decodedPath(pathname: string) { try { return decodeURIComponent(pathname); } catch { return pathname; } }

export default function EntryReveal() {
  const pathname = usePathname();
  const [finished, setFinished] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const excluded = /^\/(?:admin(?:-preview)?|auth|profile|tickets)(?:\/|$)/.test(pathname) || /\/checkout(?:\/|$)/.test(pathname) || /halloween|х[эе]ллоуин/i.test(decodedPath(pathname));
  useEffect(() => {
    if (finished || excluded) return;
    const element = overlay.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || getComputedStyle(element).visibility === 'hidden') { setFinished(true); return; }
    const main = document.getElementById('main-content');
    const previousInert = main?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const hadIntroClass = document.body.classList.contains('agayo-intro-active');
    document.body.classList.add('agayo-intro-active');
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    const elapsed = Number(element.getAnimations()[0]?.currentTime ?? 0);
    const timer = window.setTimeout(() => setFinished(true), Math.max(0, 1650 - elapsed) + 100);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduceMotion = () => { if (preference.matches) setFinished(true); };
    preference.addEventListener('change', reduceMotion);
    return () => { clearTimeout(timer); preference.removeEventListener('change', reduceMotion); if (main) main.inert = previousInert; document.body.style.overflow = previousOverflow; if (!hadIntroClass) document.body.classList.remove('agayo-intro-active'); };
  }, [finished, excluded]);
  if (finished || excluded) return null;
  preload('/agayo-logo-mask.png', { as: 'image' });
  return <div ref={overlay} className="agayo-entry-reveal agayo-light-intro" role="region" aria-label="Вступление AGAYO" onAnimationEnd={event => { if (event.target === event.currentTarget) setFinished(true); }}>
    <div className="intro-light-field" aria-hidden="true" />
    <div className="intro-light-lockup" aria-hidden="true">
      <div className="intro-light-logo" />
      <div className="intro-light-caption">ПОЧУВСТВУЙ. ПРОЖИВИ. ЗАПОМНИ.</div>
    </div>
    <button className="agayo-entry-skip" type="button" onClick={() => setFinished(true)}>Пропустить ↗</button>
  </div>;
}
