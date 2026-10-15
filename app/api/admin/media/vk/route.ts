import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { db } from "@/lib/server/db";
import { resolveBlobToken } from "@/lib/server/blob";
import { invalidatePublicContent } from "@/lib/server/public-content";
import { VkImportError, parseVkAlbum, listVkAlbumPage, getVkPhoto, downloadVkPhoto, vkPhotoSourceKey, commitVkPhoto, canDeleteVkUpload } from "@/lib/server/vk-import";

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
    await requireAdminPermission("manage_media");
    return NextResponse.json({ vkConnected: Boolean(process.env.VK_ACCESS_TOKEN?.trim()), storageConnected: Boolean(resolveBlobToken()) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  let uploaded: { url: string; token: string; sourceKey: string } | null = null;
  let cleanupSql: ReturnType<typeof db> | null = null;
  try {
    // Authorize before parsing input or making any external request.
    await requireAdminPermission("manage_media");
    const body = await requestBody(request);
    const eventSlug = typeof body?.eventSlug === "string" ? body.eventSlug.trim() : "";
    if (!eventSlug || eventSlug.length > 180) throw new VkImportError("Выбери мероприятие");
    const access = await requireAdminPermission("manage_media", eventSlug);
    const album = parseVkAlbum(body.albumUrl);
    const sql = db();
    cleanupSql = sql;
    if (!(await sql`SELECT id FROM events WHERE slug=${eventSlug} LIMIT 1`)[0]) throw new VkImportError("Мероприятие не найдено", 404);
    const vkToken = process.env.VK_ACCESS_TOKEN?.trim() || "";
    if (body.action === "list") return NextResponse.json({ albumUrl: album.url, ...(await listVkAlbumPage(album, body.offset ?? 0, vkToken)) });
    if (body.action !== "import") throw new VkImportError("Неизвестное действие");
    const photoId = body.photoId;
    if (!Number.isSafeInteger(photoId) || photoId < 1) throw new VkImportError("Некорректный номер фотографии");
    const sourceKey = vkPhotoSourceKey(album, photoId, eventSlug);
    const existing = await sql`SELECT id,event_slug,url,caption,sort_order,is_featured,is_published,created_at FROM media_photos WHERE source_key=${sourceKey} AND event_slug=${eventSlug} LIMIT 1`;
    if (existing[0]) return NextResponse.json({ ok: true, skipped: true, photo: existing[0] });
    const token = resolveBlobToken();
    if (!token) throw new VkImportError("Хранилище фотографий не подключено", 503);
    const photo = await getVkPhoto(album, photoId, vkToken);
    const image = await downloadVkPhoto(photo.url);
    // Permissions may have changed during a slow external download.
    await requireAdminPermission("manage_media", eventSlug);
    const blob = await put(`media/photo/vk-${album.ownerId}-${photo.id}.${image.extension}`, image.bytes, { access: "public", addRandomSuffix: true, contentType: image.contentType, token });
    uploaded = { url: blob.url, token, sourceKey };
    const result = await commitVkPhoto(sql, { album, photo, sourceKey, eventSlug, blobUrl: blob.url, userId: access.userId });
    // A committed row owns its Blob even if later cache invalidation fails.
    uploaded = null;
    if (result.skipped) { try { await del(blob.url, { token }); } catch { console.error("VK import duplicate upload cleanup failed"); } }
    else { try { invalidatePublicContent("media"); } catch { console.error("VK import cache invalidation failed"); } }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (uploaded && cleanupSql) {
      try {
        if (await canDeleteVkUpload(cleanupSql, uploaded.sourceKey, uploaded.url)) await del(uploaded.url, { token: uploaded.token });
      } catch { console.error("VK import upload retained because commit status or cleanup could not be verified"); }
    }
    return failure(error);
  }
}
