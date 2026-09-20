import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

export const runtime = "nodejs";

const YANDEX_PUBLIC_API = "https://cloud-api.yandex.net/v1/disk/public/resources";
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const MAX_FILES = 250;

type YandexItem = {
  type?: string;
  name?: string;
  path?: string;
  size?: number;
  mime_type?: string;
  media_type?: string;
  _embedded?: { items?: YandexItem[] };
};

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function isImage(item: YandexItem) {
  const mime = String(item.mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(item.name || "").toLowerCase();
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(name);
}

async function yandexJson(url: string) {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  let data: any = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const description = data?.description || data?.message || `Яндекс Диск вернул ${response.status}`;
    throw new Error(String(description));
  }
  return data;
}

async function getResource(publicUrl: string, path?: string) {
  const params = new URLSearchParams({ public_key: publicUrl, limit: "1000" });
  if (path) params.set("path", path);
  return yandexJson(`${YANDEX_PUBLIC_API}?${params.toString()}`) as Promise<YandexItem>;
}

async function walkFolder(publicUrl: string, resource: YandexItem, result: YandexItem[], depth = 0) {
  if (result.length >= MAX_FILES || depth > 5) return;
  if (resource.type === "file") {
    if (isImage(resource) && Number(resource.size || 0) <= MAX_FILE_SIZE) result.push(resource);
    return;
  }
  const items = resource._embedded?.items || [];
  for (const item of items) {
    if (result.length >= MAX_FILES) break;
    if (item.type === "file") {
      if (isImage(item) && Number(item.size || 0) <= MAX_FILE_SIZE) result.push(item);
      continue;
    }
    if (item.type === "dir" && item.path) {
      try {
        const nested = await getResource(publicUrl, item.path);
        await walkFolder(publicUrl, nested, result, depth + 1);
      } catch (error) {
        console.warn("Yandex Disk nested folder:", error instanceof Error ? error.message : error);
      }
    }
  }
}

async function getDownloadHref(publicUrl: string, path?: string) {
  const params = new URLSearchParams({ public_key: publicUrl });
  if (path) params.set("path", path);
  const data = await yandexJson(`${YANDEX_PUBLIC_API}/download?${params.toString()}`);
  const href = text(data?.href, 8000);
  if (!href || !href.startsWith("https://")) throw new Error("Яндекс Диск не выдал ссылку для скачивания");
  return href;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = text(body.action, 20);
    const publicUrl = text(body.publicUrl, 3000);
    const eventSlug = text(body.eventSlug, 180);
    if (!publicUrl) return NextResponse.json({ error: "Публичная ссылка Яндекс Диска не указана" }, { status: 400 });
    if (!eventSlug) return NextResponse.json({ error: "Выбери мероприятие" }, { status: 400 });

    let parsed: URL;
    try { parsed = new URL(publicUrl); } catch { return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 }); }
    if (parsed.protocol !== "https:") return NextResponse.json({ error: "Нужна HTTPS-ссылка Яндекс Диска" }, { status: 400 });

    const access = await requireAdminPermission("manage_media", eventSlug);

    if (action === "list") {
      const root = await getResource(publicUrl);
      const found: YandexItem[] = [];
      await walkFolder(publicUrl, root, found);
      return NextResponse.json({
        resources: found.map((item) => ({
          path: String(item.path || ""),
          name: String(item.name || "photo"),
          size: Number(item.size || 0),
          mime_type: String(item.mime_type || "image/*"),
        })),
        truncated: found.length >= MAX_FILES,
      });
    }

    if (action === "import") {
      const token = resolveBlobToken();
      if (!token) return NextResponse.json({ error: "Vercel Blob не подключён" }, { status: 503 });
      const path = text(body.path, 2500);
      const requestedName = text(body.name, 300) || path.split("/").pop() || "photo.jpg";
      const sourceKey = crypto.createHash("sha256").update(`yandex:${publicUrl}:${path || requestedName}`).digest("hex");
      const sql = db();
      const existing = await sql`SELECT id,event_slug,url,caption,sort_order,is_featured,is_published,created_at FROM media_photos WHERE source_key=${sourceKey} LIMIT 1`;
      if (existing[0]) return NextResponse.json({ ok:true, skipped:true, photo:existing[0] });
      const href = await getDownloadHref(publicUrl, path || undefined);
      const source = await fetch(href, { cache: "no-store" });
      if (!source.ok) throw new Error(`Не удалось скачать файл с Яндекс Диска (${source.status})`);

      const length = Number(source.headers.get("content-length") || 0);
      if (length > MAX_FILE_SIZE) return NextResponse.json({ error: "Фотография больше 16 МБ" }, { status: 413 });
      const contentType = String(source.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
      if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Ссылка ведёт не на изображение" }, { status: 400 });
      const bytes = Buffer.from(await source.arrayBuffer());
      if (bytes.length > MAX_FILE_SIZE) return NextResponse.json({ error: "Фотография больше 16 МБ" }, { status: 413 });

      const safeName = requestedName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180) || "photo.jpg";
      const blob = await put(`media/photo/yandex-${Date.now()}-${safeName}`, bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType,
        token,
      });

      const rows = await sql`
        INSERT INTO media_photos(event_slug,url,caption,sort_order,is_featured,is_published,created_by,source_key)
        VALUES(${eventSlug},${blob.url},'',0,false,true,${access.userId},${sourceKey})
        ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
        RETURNING id,event_slug,url,caption,sort_order,is_featured,is_published,created_at
      `;
      if (!rows[0]) {
        try { await (await import("@vercel/blob")).del(blob.url,{token}); } catch {}
        const duplicate = await sql`SELECT id,event_slug,url,caption,sort_order,is_featured,is_published,created_at FROM media_photos WHERE source_key=${sourceKey} LIMIT 1`;
        return NextResponse.json({ ok:true, skipped:true, photo:duplicate[0] || null });
      }
      await writeAdminAudit(access.userId, "media.photo.yandex_import", "media_photo", String(rows[0].id), {
        eventSlug, sourceName: requestedName,
      });
      return NextResponse.json({ ok: true, photo: rows[0] });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    console.error("Yandex Disk import:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось импортировать фотографии" }, { status });
  }
}
