import type { AgayoEvent } from './events';
// This artwork belongs to the 2026 AGAYO event, including its archived page
// and purchased tickets. Future Halloween events get no implicit effects.
export function isHalloweenEvent(event: Pick<AgayoEvent, 'slug' | 'title'>) {
  const slug = event.slug.trim().toLowerCase();
  const title = event.title.trim().replace(/\s+/g, ' ').toUpperCase();
  return slug === 'agayo-halloween-история-одного-клоуна'
    || title === 'AGAYO HALLOWEEN: ПОСЛЕДНЯЯ УЛЫБКА';
}
export function eventPalette(theme?: AgayoEvent['ticketTheme']) {
  const safe = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return { primary: safe(theme?.primary, '#0B0B0C'), secondary: safe(theme?.secondary, '#6B1F2B'), accent: safe(theme?.accent, '#C21F39') };
}
