import Link from "next/link";
import Image from "next/image";

const photos = [
  ["1516450360452-9312f5e86fc7", "AGAYO NIGHT"],
  ["1506157786151-b8491531f063", "SUMMER / 01"],
  ["1501386761578-eac5c94b800a", "CLUBSHOW"],
  ["1492684223066-81342ee5ff30", "AGAYO NIGHT"],
  ["1524368535928-5b5e00ddc76b", "SUMMER / 01"],
  ["1514525253161-7a46d19cd819", "CLUBSHOW"],
].map(([id, event]) => ({
  event,
  src: `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=85`,
}));

export default function GalleryPage() {
  return (
    <main className="inner-page">
      <header className="inner-header">
        <Link href="/" className="brand">AGAYO<span className="brand-dot">.</span></Link>
        <Link href="/profile" className="header-action">Профиль</Link>
      </header>
      <div className="inner-wrap">
        <div className="section-label">02 / ГАЛЕРЕЯ</div>
        <h1 className="inner-title">ТЕ САМЫЕ<br />ВЕЧЕРА.</h1>
        <p className="inner-lead">Фотографии моментов, которые уже стали воспоминаниями.</p>
        <div className="gallery-grid">
          {photos.map((photo, index) => (
            <Link href={`/events/${index % 2 ? "summer-01" : "agayo-night"}`} className="gallery-card" key={`${photo.event}-${index}`}>
              <div className="gallery-image-wrap">
                <Image src={photo.src} alt={photo.event} fill sizes="(max-width: 700px) 100vw, 50vw" className="gallery-image" />
                <span className="gallery-heart">♡</span>
              </div>
              <div className="gallery-caption"><span>{photo.event}</span><span>↗</span></div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
