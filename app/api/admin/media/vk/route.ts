import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { invalidatePublicContent } from "@/lib/server/public-content";
import { VkImportError, parseVkAlbum, listVkAlbumPage } from "@/lib/server/vk-import";
import { clearExternalGalleryCache, saveExternalSource } from '@/lib/server/external-gallery';

export const runtime = "nodejs";
export const maxDuration = 60;

function failure(error: unknown) {
  const known = error instanceof AdminAccessError || error instanceof VkImportError;
  if (!known) console.error("VK album import failed");
  return NextResponse.json({ error: known ? error.message : "Не удалось импортировать фотографию. Попробуй продолжить позже" }, { status: known ? error.status : 500 });
}

async function requestBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8000) throw new VkImportError("Слишком большой запрос", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new VkImportError("Пустой запрос");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8000) { await reader.cancel(); throw new VkImportError("Слишком большой запрос", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
  catch { throw new VkImportError("Некорректный запрос"); }
}

export async function GET() {
  try {
    const access = await requireAdminPermission("manage_media");
    const sql = db();
    const [ready] = await sql`SELECT to_regclass('public.event_gallery_sources') AS name`;
    const sources = ready?.name ? await sql`SELECT event_slug,album_url FROM event_gallery_sources
      WHERE (${access.role === 'owner' || access.allEvents} OR event_slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(access.eventSlugs)}::text::jsonb)))` : [];
    return NextResponse.json({ vkConnected: Boolean(process.env.VK_ACCESS_TOKEN?.trim()), sources });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    // Authorize before parsing input or making any external request.
    await requireAdminPermission("manage_media");
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new AdminAccessError('Недопустимый источник запроса',403);
    const body = await requestBody(request);
    const eventSlug = typeof body?.eventSlug === "string" ? body.eventSlug.trim() : "";
    if (!eventSlug || eventSlug.length > 180) throw new VkImportError("Выбери мероприятие");
    const access = await requireAdminPermission("manage_media", eventSlug);
    // Previous releases copied files into Blob. External mode explicitly forbids that operation.
    if (body.action === 'import') throw new VkImportError('Копирование ВК в хранилище отключено. Подключи внешний альбом.', 410);
    const album = parseVkAlbum(body.albumUrl);
    const sql = db();
    if (!(await sql`SELECT id FROM events e WHERE slug=${eventSlug} AND (to_jsonb(e)->>'deleted_at') IS NULL LIMIT 1`)[0]) throw new VkImportError("Мероприятие не найдено", 404);
    const vkToken = process.env.VK_ACCESS_TOKEN?.trim() || "";
    if (body.action === 'connect' || body.action === 'disconnect') {
      const preview = body.action === 'connect' ? await listVkAlbumPage(album, 0, vkToken) : null;
      await requireAdminPermission('manage_media', eventSlug);
      await saveExternalSource(eventSlug, body.action === 'connect' ? album.url : null, access.userId, preview?.total ?? 0);
      clearExternalGalleryCache();
      try { invalidatePublicContent('media'); } catch { console.error('External gallery cache invalidation failed'); }
      return NextResponse.json({ ok: true, albumUrl: album.url, total: preview?.total ?? 0 });
    }
    if (body.action === "list") return NextResponse.json({ albumUrl: album.url, ...(await listVkAlbumPage(album, body.offset ?? 0, vkToken)) });
    throw new VkImportError("Неизвестное действие");
  } catch (error) { return failure(error); }
}
