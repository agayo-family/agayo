export function siteOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.agayo.ru");
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : "https://www.agayo.ru";
  } catch { return "https://www.agayo.ru"; }
}
