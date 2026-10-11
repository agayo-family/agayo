import { NextResponse } from "next/server";
import { ContentValidationError, parseAboutContent, parseContentVersion } from "@/lib/about-content";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { getAboutPageServer } from "@/lib/server/about";
import { db } from "@/lib/server/db";
import { ContentConflictError, saveSitePage } from "@/lib/server/site-content-store";
import { invalidatePublicContent } from "@/lib/server/public-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ContentConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof ContentValidationError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "Некорректный запрос" : error.message }, { status: 400 });
  console.error("[about-content] Operation failed", { code: (error as { code?: string } | null)?.code ?? "unknown" });
  return NextResponse.json({ error: "Не удалось сохранить или загрузить страницу. Попробуй ещё раз." }, { status: 500 });
}

export async function GET() {
  try {
    await requireAdminPermission("manage_about");
    return NextResponse.json(await getAboutPageServer());
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AdminAccessError("Недопустимый источник запроса", 403);
    const access = await requireAdminPermission("manage_about");
    const body = await request.json();
    const content = parseAboutContent(body?.content);
    const version = parseContentVersion(body?.version);
    const result = await saveSitePage(db(), "about", content, version, access.userId);
    invalidatePublicContent("about");
    return NextResponse.json({ content, ...result });
  } catch (error) { return errorResponse(error); }
}
