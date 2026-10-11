import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v13_3.css";
import "./v13_4.css";
import "./site-audit.css";
import "./experience.css";
import EntryReveal from "@/components/EntryReveal";
import PublicMotion from "@/components/PublicMotion";
import HalloweenSoundGate from "@/components/HalloweenSoundGate";
import { siteOrigin } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: "AGAYO — создавай воспоминания", template: "%s — AGAYO" },
  openGraph: { type: "website", locale: "ru_RU", siteName: "AGAYO", title: "AGAYO — создавай воспоминания", description: "Вечеринки, концерты и клабшоу в Йошкар-Оле. Мы — свои.", images: [{ url: "/events/vernite-lampovost-poster.jpg" }] },
  twitter: { card: "summary_large_image" },
  description: "AGAYO — события для тех, кто хочет прожить молодость так, чтобы её захотелось вспомнить.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0B0C",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><EntryReveal /><PublicMotion /><HalloweenSoundGate />{children}</body></html>;
}
