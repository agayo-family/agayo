import FavoritesGrid from "@/components/FavoritesGrid";
import SiteHeader from "@/components/SiteHeader";

export default function FavoritesPage() {
  return <main className="inner-page"><SiteHeader /><div className="inner-wrap"><div className="section-label">ПРОФИЛЬ / ИЗБРАННОЕ</div><h1 className="inner-title">ТВОИ<br />ФОТО</h1><FavoritesGrid /></div></main>;
}
