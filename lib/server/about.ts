import { defaultAboutContent, parseAboutContent } from "../about-content";
import { db } from "./db";
import { readSitePage } from "./site-content-store";

export async function getAboutPageServer() {
  if (!process.env.DATABASE_URL) return { content: defaultAboutContent, version: 0, updatedAt: null };
  const row = await readSitePage(db(), "about");
  return row
    ? { content: parseAboutContent(row.content), version: Number(row.version), updatedAt: row.updated_at }
    : { content: defaultAboutContent, version: 0, updatedAt: null };
}

export async function getPublicAboutServer() {
  const { content } = await getAboutPageServer();
  // Hidden organizer cards never reach the public HTML or RSC payload.
  return { ...content, organizers: content.organizers.filter((person) => person.visible) };
}
