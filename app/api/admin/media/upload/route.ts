import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const eventSlug = String(data.get("eventSlug") ?? "").trim() || null;
    const kind = data.get("kind") === "audio" ? "audio" : "photo";
    await requireAdminPermission("manage_media", eventSlug);
    const token = resolveBlobToken();
    if (!token) return NextResponse.json({ error: "Vercel Blob не подключён" }, { status: 503 });
    const file = data.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });

    if (kind === "photo") {
      if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Нужен файл изображения" }, { status: 400 });
      if (file.size > 16 * 1024 * 1024) return NextResponse.json({ error: "Фотография больше 16 МБ" }, { status: 400 });
    } else {
      if (!file.type.startsWith("audio/")) return NextResponse.json({ error: "Нужен аудиофайл" }, { status: 400 });
      if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: "Аудио больше 30 МБ" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`media/${kind}/${Date.now()}-${safeName}`, file, { access: "public", addRandomSuffix: true, token });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файл" }, { status });
  }
}
