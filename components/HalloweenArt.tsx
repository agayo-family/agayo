import { BAT_ART, CLOWN_ART, MONSTER_ART, CIRCUS_ART } from '@/lib/halloween-art';
export function BatArt() { return <svg viewBox="0 0 100 70" focusable="false" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BAT_ART }} />; }
export function ClownArt({ monster = false }: { monster?: boolean }) { return <svg viewBox="0 0 160 200" focusable="false" aria-hidden="true" dangerouslySetInnerHTML={{ __html: monster ? MONSTER_ART : CLOWN_ART }} />; }
export default function HalloweenArt({ compact = false }: { compact?: boolean }) {
  return <div className={`halloween-art ${compact ? 'is-compact' : ''}`} aria-hidden="true"><svg viewBox="0 0 1000 650" focusable="false" dangerouslySetInnerHTML={{ __html: CIRCUS_ART }} /><div className="halloween-clown"><ClownArt /></div><div className="halloween-static-bats"><BatArt /><BatArt /><BatArt /></div></div>;
}
