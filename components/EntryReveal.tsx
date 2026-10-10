// Presentation only: no timer, hydration dependency, body lock or request delay.
// The CSS animation ends on its own, including with JavaScript disabled.
export default function EntryReveal() {
  return <div className="agayo-entry-reveal" aria-hidden="true"><div className="agayo-entry-mark"><span className="brand-logo-mark" /><span>МЫ — СВОИ</span></div></div>;
}
