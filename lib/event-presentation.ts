import type { AgayoEvent } from './events';
export function isHalloweenEvent(event: Pick<AgayoEvent, 'slug' | 'title'>) { return /halloween|х[эе]ллоуин/i.test(`${event.slug} ${event.title}`); }
export function eventPalette(theme?: AgayoEvent['ticketTheme']) {
  const safe = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return { primary: safe(theme?.primary, '#0B0B0C'), secondary: safe(theme?.secondary, '#6B1F2B'), accent: safe(theme?.accent, '#C21F39') };
}
