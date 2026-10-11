'use client';
import { useEffect, useRef, useState } from 'react';
import HalloweenArt, { BatArt, ClownArt } from './HalloweenArt';
import { playHalloweenSound, unlockHalloweenSound } from '@/lib/client/halloween-sound';
import { dueHalloweenScare, canTriggerHalloweenScare } from '@/lib/halloween-timing';

export default function HalloweenExperience({ slug }: { slug: string }) {
  const [intro, setIntro] = useState(true);
  const [effects, setEffects] = useState(true);
  const [sound, setSound] = useState(false);
  const [scare, setScare] = useState<'clown' | 'monster' | null>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const lastScare = useRef(0);
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) { setIntro(false); setEffects(false); }
    try { setSound(sessionStorage.getItem('agayo-halloween-sound-v1') === 'on'); } catch {}
    const change = () => { if (preference.matches) { setEffects(false); setScare(null); setIntro(false); } };
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, [slug]);
  useEffect(() => {
    if (!intro) return;
    const main = document.getElementById('main-content');
    const wasInert = main?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    const elapsed = Number(introRef.current?.getAnimations()[0]?.currentTime ?? 0);
    const timer = setTimeout(() => setIntro(false), Math.max(0, 1500 - elapsed) + 100);
    return () => { clearTimeout(timer); if (main) main.inert = wasInert; document.body.style.overflow = overflow; };
  }, [intro]);
  useEffect(() => {
    if (!effects || intro) return;
    let seconds = 0;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const trigger = (type: 'clown' | 'monster') => {
      if (!canTriggerHalloweenScare(type, Date.now(), lastScare.current, document.hidden)) return;
      lastScare.current = Date.now(); setScare(type);
      if (soundRef.current) playHalloweenSound(type === 'monster');
      clearTimeout(hide); hide = setTimeout(() => setScare(null), 750);
    };
    const interval = setInterval(() => {
      if (document.hidden) return;
      const due = dueHalloweenScare(++seconds);
      if (due) trigger(due);
    }, 1000);
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.event-v2-hero .button-link, .event-v2-final .button-link, .event-rules-link'));
    const chosen = buttons[Math.floor(Math.random() * buttons.length)];
    const surprise = () => { trigger('clown'); };
    chosen?.addEventListener('click', surprise, { once: true });
    return () => { clearInterval(interval); clearTimeout(hide); chosen?.removeEventListener('click', surprise); setScare(null); };
  }, [effects, intro, slug]);
  return <>
    <div className="halloween-controls"><button type="button" onClick={() => { setEffects(value => !value); setScare(null); }}>Эффекты: {effects ? 'вкл' : 'выкл'}</button><button type="button" data-halloween-sound={!sound ? 'true' : undefined} onClick={() => { const next = !sound; if (next) unlockHalloweenSound(); setSound(next); try { sessionStorage.setItem('agayo-halloween-sound-v1', next ? 'on' : 'off'); } catch {} }}>Звук: {sound ? 'вкл' : 'выкл'}</button><span>Короткие появления клоуна и монстра</span></div>
    {intro && <div ref={introRef} className="halloween-entry" role="region" aria-label="Вступление Halloween" onAnimationEnd={event => { if (event.target === event.currentTarget) setIntro(false); }}><HalloweenArt /><div className="halloween-entry-copy">AGAYO HALLOWEEN<span>ЦИРК УЖЕ ЖДЁТ ТЕБЯ</span></div><div className="halloween-entry-swarm" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ '--bat': index } as React.CSSProperties}><BatArt /></i>)}</div><button type="button" className="agayo-entry-skip" onClick={() => setIntro(false)}>Пропустить ↗</button></div>}
    {scare && <div className={`halloween-scare is-${scare}`} aria-hidden="true"><div className="halloween-scare-face"><ClownArt monster={scare === 'monster'} /></div>{scare === 'monster' && <><div className="halloween-scare-moon" /><div className="halloween-scare-bats"><BatArt /><BatArt /><BatArt /></div></>}</div>}
  </>;
}
