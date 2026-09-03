import { NextResponse } from "next/server";
import { getCurrentAdminAccess } from "@/lib/server/admin";

export async function GET() {
  const access = await getCurrentAdminAccess();
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ access });
}
