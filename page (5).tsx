import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="inner-page about-page">
      <header className="inner-header">
        <Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link>
        <Link href="/profile" className="header-action">Профиль</Link>
      </header>
      <div className="inner-wrap about-content">
        <div className="section-label">03 / AGAYO</div>
        <h1 className="inner-title">МЫ —<br />СВОИ.</h1>
        <div className="about-copy">
          <p>Мы обычные подростки. Учимся, гуляем, знакомимся, смеёмся над тупыми шутками и иногда вообще не знаем, чем заняться вечером.</p>
          <p>Поэтому создаём вечера, которые сами хотели бы прожить.</p>
          <div className="tag-row"><span>14+</span><span>18:00—21:00</span><span>Alcohol Free</span></div>
        </div>
        <div className="about-statement">Прожить молодость так, чтобы её захотелось вспомнить.</div>
      </div>
    </main>
  );
}
