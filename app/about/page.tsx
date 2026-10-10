import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "О нас", description: "AGAYO — команда, которая создаёт вечеринки, концерты и клабшоу без алкоголя в Йошкар-Оле.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <main id="main-content" className="inner-page about-page">
      <SiteHeader />
      <div className="inner-wrap about-content">
        <div className="section-label">03 / AGAYO</div>
        <h1 className="inner-title">МЫ —<br />СВОИ.</h1>
        <div className="about-copy">
          <p>Мы обычные подростки. Учимся, гуляем, знакомимся, смеёмся над тупыми шутками и иногда вообще не знаем, чем заняться вечером.</p>
          <p>Поэтому создаём вечера, которые сами хотели бы прожить.</p>
          <div className="tag-row"><span>14+</span><span>Йошкар-Ола</span><span>Alcohol Free</span></div>
        </div>
        <div className="about-statement">Прожить молодость так, чтобы её захотелось вспомнить.</div>
      </div>
    </main>
  );
}
