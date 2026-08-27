import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGAYO — создавай воспоминания",
  description: "AGAYO — события для тех, кто хочет прожить молодость так, чтобы её захотелось вспомнить.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
