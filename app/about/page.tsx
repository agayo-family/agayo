import SiteHeader from "@/components/SiteHeader";
import AboutContentView from "@/components/AboutContentView";
import { getPublicAbout } from "@/lib/server/public-content";
import "./about.css";

export const metadata = { title: "О нас", description: "AGAYO — команда, которая создаёт вечеринки, концерты и клабшоу без алкоголя в Йошкар-Оле.", alternates: { canonical: "/about" } };

export const revalidate = 60;

export default async function AboutPage() {
  const content = await getPublicAbout();
  return (
    <main id="main-content" className="inner-page about-page">
      <SiteHeader />
      <div className="inner-wrap about-content">
        <AboutContentView content={content} />
      </div>
    </main>
  );
}
