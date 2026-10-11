import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";
import { isUploadPathAllowed, isUploadPurpose, uploadPolicies } from "@/lib/upload-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    if (!body || !["blob.generate-client-token", "blob.upload-completed"].includes(body.type)) return NextResponse.json({ error: "Некорректный запрос загрузки" }, { status: 400 });
    // The signed Blob callback has no browser cookie/origin. Only token issuance
    // requires a same-origin browser request and the existing admin permissions.
    if (body.type === "blob.generate-client-token") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Недопустимый источник загрузки" }, { status: 403 });
    }
    const token = resolveBlobToken();
    if (!token) return NextResponse.json({ error: "Vercel Blob не подключён" }, { status: 503 });
    const result = await handleUpload({ request, body, token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let input: { purpose?: unknown; eventSlug?: unknown };
        try { input = JSON.parse(clientPayload || "{}"); } catch { throw new Error("Некорректные параметры загрузки"); }
        if (!input || !isUploadPurpose(input.purpose) || !isUploadPathAllowed(pathname, input.purpose)) throw new Error("Недопустимый путь загрузки");
        const purpose = input.purpose;
        const eventSlug = typeof input.eventSlug === "string" ? input.eventSlug.trim().slice(0, 180) || null : null;
        if (purpose === "photo" && !eventSlug) throw new Error("Выбери мероприятие");
        const permission = purpose === "poster" ? "manage_events" : purpose === "loyalty" ? "manage_loyalty" : purpose === "organizer" ? "manage_about" : "manage_media";
        const access = await requireAdminPermission(permission, purpose === "loyalty" || purpose === "organizer" ? null : eventSlug);
        if (purpose === "audio" && !eventSlug && access.role !== "owner" && !access.allEvents) throw new AdminAccessError("Недостаточно прав для общего отзыва", 403);
        return { allowedContentTypes: [...uploadPolicies[purpose].allowedContentTypes], maximumSizeInBytes: uploadPolicies[purpose].maximumSizeInBytes,
          addRandomSuffix: true, allowOverwrite: false, validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      // SDK verifies the callback signature. A separate authenticated save
      // publishes the event/photo/review; uploading alone never publishes it.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 400;
    return NextResponse.json({ error: error instanceof AdminAccessError ? error.message : "Не удалось разрешить загрузку файла. Проверь формат и права доступа." }, { status });
  }
}
