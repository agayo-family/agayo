import { createHash } from "node:crypto";

export const VK_PAGE_SIZE = 25;
export const VK_MAX_PHOTO_BYTES = 16 * 1024 * 1024;
const VK_API_VERSION = "5.199";
const VK_API_BASE = "https://api.vk.com/method/";

export class VkImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type VkAlbum = { ownerId: number; albumId: number; url: string };
export type VkPhoto = { id: number; caption: string; url: string; width: number; height: number };

export function parseVkAlbum(value: unknown): VkAlbum {
  let url: URL;
  try { url = new URL(String(value ?? "").trim()); } catch { throw new VkImportError("Укажи ссылку ВК вида https://vk.ru/album-123_456"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !["vk.ru", "www.vk.ru", "vk.com", "www.vk.com", "m.vk.com", "m.vk.ru"].includes(url.hostname)) {
    throw new VkImportError("Нужна HTTPS-ссылка на альбом vk.ru или vk.com");
  }
  const match = /^\/album(-?[1-9]\d*)_([1-9]\d*)\/?$/.exec(url.pathname);
  if (!match) throw new VkImportError("Открой сам альбом ВК и скопируй ссылку вида album-123_456");
  const ownerId = Number(match[1]), albumId = Number(match[2]);
  if (![ownerId, albumId].every(Number.isSafeInteger)) throw new VkImportError("Некорректный номер альбома");
  return { ownerId, albumId, url: `https://vk.ru/album${ownerId}_${albumId}` };
}

export function assertVkImageUrl(value: unknown): URL {
  let url: URL;
  try { url = new URL(String(value ?? "")); } catch { throw new VkImportError("ВК вернул некорректный адрес фотографии", 502); }
  const trustedHost = ["userapi.com", "vkuserphoto.ru"].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (url.protocol !== "https:" || url.port || url.username || url.password || !trustedHost) throw new VkImportError("Адрес фотографии не входит в разрешённые CDN ВК", 502);
  return url;
}

export function normalizeVkPhoto(raw: any, album: VkAlbum): VkPhoto {
  if (Number(raw?.owner_id) !== album.ownerId || Number(raw?.album_id) !== album.albumId || !Number.isSafeInteger(raw?.id) || raw.id < 1) {
    throw new VkImportError("Фотография не принадлежит выбранному альбому", 400);
  }
  const sizes = Array.isArray(raw.sizes) ? raw.sizes : [];
  const largest = [...sizes, ...(raw.orig_photo ? [raw.orig_photo] : [])]
    .filter(item => item && Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0 && typeof item.url === "string")
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!largest) throw new VkImportError("ВК не предоставил файл фотографии", 502);
  const url = assertVkImageUrl(largest.url);
  return { id: raw.id, caption: String(raw.text || "").trim().slice(0, 500), url: url.href, width: largest.width, height: largest.height };
}

async function vkApi(method: "photos.get" | "photos.getById", params: Record<string, string>, token: string, fetcher: typeof fetch) {
  if (!token.trim()) throw new VkImportError("Импорт ВК не подключён: нужен серверный VK_ACCESS_TOKEN с доступом к фотографиям альбома", 503);
  let response: Response;
  try {
    response = await fetcher(`${VK_API_BASE}${method}`, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ ...params, access_token: token, v: VK_API_VERSION }) });
  } catch { throw new VkImportError("ВК не отвечает. Попробуй продолжить импорт позже", 502); }
  if (!response.ok) throw new VkImportError("ВК временно недоступен. Попробуй позже", 502);
  let data: any;
  try { data = await response.json(); } catch { throw new VkImportError("ВК вернул неверный ответ", 502); }
  if (data?.error) {
    const code = Number(data.error.error_code);
    if ([5, 27, 28].includes(code)) throw new VkImportError("ВК отклонил серверный токен. Обнови подключение VK_ACCESS_TOKEN", 503);
    if ([7, 15, 30, 200, 203].includes(code)) throw new VkImportError("У серверного токена ВК нет доступа к этому альбому. Проверь доступ и разрешение photos", 403);
    if ([6, 9, 29].includes(code)) throw new VkImportError("ВК ограничил частоту запросов. Поставь импорт на паузу и продолжи позже", 429);
    if (code === 14) throw new VkImportError("ВК запросил проверку доступа. Импорт приостановлен; восстанови доступ в ВК вручную", 409);
    throw new VkImportError("ВК не разрешил получить фотографии. Проверь ссылку и доступ к альбому", 502);
  }
  if (data?.response == null) throw new VkImportError("ВК вернул пустой ответ", 502);
  return data.response;
}

export async function listVkAlbumPage(album: VkAlbum, offset: number, token: string, fetcher: typeof fetch = fetch) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new VkImportError("Некорректная позиция импорта");
  const result = await vkApi("photos.get", { owner_id: String(album.ownerId), album_id: String(album.albumId), offset: String(offset), count: String(VK_PAGE_SIZE), photo_sizes: "1", rev: "0" }, token, fetcher);
  if (!Array.isArray(result?.items) || !Number.isSafeInteger(result?.count) || result.count < 0 || result.items.length > VK_PAGE_SIZE) throw new VkImportError("ВК вернул неверный список фотографий", 502);
  const items: Array<Pick<VkPhoto, "id" | "caption" | "width" | "height">> = [], failures: Array<{ id: number | null; error: string }> = [];
  for (const raw of result.items) {
    try { const { id, caption, width, height } = normalizeVkPhoto(raw, album); items.push({ id, caption, width, height }); }
    catch (error) { failures.push({ id: Number.isSafeInteger(raw?.id) ? raw.id : null, error: error instanceof VkImportError ? error.message : "Фотография недоступна" }); }
  }
  const nextOffset = offset + result.items.length;
  return { items, failures, total: result.count, nextOffset: result.items.length && nextOffset < result.count ? nextOffset : null };
}

export async function getVkPhoto(album: VkAlbum, photoId: number, token: string, fetcher: typeof fetch = fetch) {
  if (!Number.isSafeInteger(photoId) || photoId < 1) throw new VkImportError("Некорректный номер фотографии");
  const result = await vkApi("photos.getById", { photos: `${album.ownerId}_${photoId}`, photo_sizes: "1" }, token, fetcher);
  if (!Array.isArray(result) || result.length !== 1) throw new VkImportError("Фотография больше недоступна в ВК", 404);
  return normalizeVkPhoto(result[0], album);
}

// External gallery mode: return CDN links directly; never download or persist photos.
export async function getVkExternalPage(album: VkAlbum, offset: number, count: number, token: string, fetcher: typeof fetch = fetch) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(count) || count < 1 || count > 24) throw new VkImportError('Некорректная страница альбома');
  const result = await vkApi('photos.get', { owner_id: String(album.ownerId), album_id: String(album.albumId), offset: String(offset), count: String(count), photo_sizes: '1', rev: '0' }, token, fetcher);
  if (!Array.isArray(result?.items) || !Number.isSafeInteger(result?.count) || result.count < 0 || result.items.length > count) throw new VkImportError('ВК вернул неверный список фотографий', 502);
  return { total: result.count as number, items: result.items.map((raw: unknown) => normalizeVkPhoto(raw, album)) as VkPhoto[] };
}

function imageExtension(bytes: Uint8Array, contentType: string): string | null {
  if (contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (contentType === "image/png" && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (contentType === "image/gif" && ["GIF87a", "GIF89a"].includes(Buffer.from(bytes.subarray(0, 6)).toString("ascii"))) return "gif";
  if (contentType === "image/webp" && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "webp";
  if (contentType === "image/avif" && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp" && ["avif", "avis"].includes(Buffer.from(bytes.subarray(8, 12)).toString("ascii"))) return "avif";
  return null;
}

export async function downloadVkPhoto(value: string, fetcher: typeof fetch = fetch) {
  let url = assertVkImageUrl(value);
  const signal = AbortSignal.timeout(15000);
  let response: Response | undefined;
  for (let hop = 0; hop < 4; hop++) {
    try { response = await fetcher(url, { cache: "no-store", redirect: "manual", signal }); }
    catch { throw new VkImportError("Не удалось скачать фотографию ВК. Её можно повторить позже", 502); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new VkImportError("ВК вернул неверное перенаправление", 502);
      url = assertVkImageUrl(new URL(location, url).href);
      response = undefined;
      continue;
    }
    break;
  }
  if (response && [404, 410].includes(response.status)) { await response.body?.cancel(); throw new VkImportError("Фотография удалена или больше недоступна в ВК", 404); }
  if (response?.status === 429) { await response.body?.cancel(); throw new VkImportError("ВК ограничил частоту загрузок. Продолжи импорт позже", 429); }
  if (!response?.ok || !response.body) throw new VkImportError("Файл фотографии ВК недоступен", 502);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(contentType)) { await response.body.cancel(); throw new VkImportError("ВК вернул неподдерживаемый файл изображения", 415); }
  if (Number(response.headers.get("content-length") || 0) > VK_MAX_PHOTO_BYTES) { await response.body.cancel(); throw new VkImportError("Фотография больше 16 МБ", 413); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > VK_MAX_PHOTO_BYTES) { await reader.cancel(); throw new VkImportError("Фотография больше 16 МБ", 413); }
      chunks.push(chunk);
    }
  } catch (error) { if (error instanceof VkImportError) throw error; throw new VkImportError("Загрузка фотографии оборвалась. Её можно повторить позже", 502); }
  const bytes = Buffer.concat(chunks, size), extension = imageExtension(bytes, contentType);
  if (!extension) throw new VkImportError("Содержимое файла не соответствует фотографии", 415);
  return { bytes, contentType, extension };
}

export function vkPhotoSourceKey(album: VkAlbum, photoId: number, eventSlug: string) {
  return createHash("sha256").update(`vk:${album.ownerId}:${photoId}:event:${eventSlug}`).digest("hex");
}

async function lockVkSource(tx: any, sourceKey: string) {
  // The same transaction lock is used by import and uncertain-COMMIT cleanup.
  // A second connection cannot declare the upload unreferenced while its
  // original transaction is still deciding whether to commit.
  await tx`SELECT pg_advisory_xact_lock(${parseInt(sourceKey.slice(0, 8), 16) | 0},${parseInt(sourceKey.slice(8, 16), 16) | 0})`;
}

export async function canDeleteVkUpload(sql: any, sourceKey: string, blobUrl: string) {
  return sql.begin(async (tx: any) => {
    await tx`SET LOCAL statement_timeout='5s'`;
    await lockVkSource(tx, sourceKey);
    // The photo may already have been moved to a different event (and its
    // source key cleared). Any durable reference to this URL must protect it.
    const references = await tx`SELECT id FROM media_photos WHERE url=${blobUrl} LIMIT 1`;
    return references.length === 0;
  });
}

export async function commitVkPhoto(sql: any, input: { album: VkAlbum; photo: VkPhoto; sourceKey: string; eventSlug: string; blobUrl: string; userId: string }) {
  return sql.begin(async (tx: any) => {
    await lockVkSource(tx, input.sourceKey);
    const event = await tx`SELECT id FROM events WHERE slug=${input.eventSlug} FOR KEY SHARE`;
    if (!event[0]) throw new VkImportError("Мероприятие уже удалено. Выбери другое", 409);
    const rows = await tx`
      INSERT INTO media_photos(event_slug,url,caption,sort_order,is_featured,is_published,created_by,source_key)
      VALUES(${input.eventSlug},${input.blobUrl},${input.photo.caption},0,false,true,${input.userId},${input.sourceKey})
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
      RETURNING id,event_slug,url,caption,sort_order,is_featured,is_published,created_at
    `;
    if (!rows[0]) {
      const existing = await tx`SELECT id,event_slug,url,caption,sort_order,is_featured,is_published,created_at FROM media_photos WHERE source_key=${input.sourceKey} AND event_slug=${input.eventSlug} LIMIT 1`;
      if (!existing[0]) throw new VkImportError("Источник фотографии уже связан с другим мероприятием. Проверь перенос фотографии в медиатеке", 409);
      return { skipped: true, photo: existing[0] };
    }
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details) VALUES(${input.userId},'media.photo.vk_import','media_photo',${String(rows[0].id)},${JSON.stringify({ eventSlug: input.eventSlug, ownerId: input.album.ownerId, albumId: input.album.albumId, photoId: input.photo.id })}::text::jsonb)`;
    return { skipped: false, photo: rows[0] };
  });
}
