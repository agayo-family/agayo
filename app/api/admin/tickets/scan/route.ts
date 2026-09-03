import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    if (token.length < 16) return NextResponse.json({ error: "Некорректный QR" }, { status: 400 });
    const sql = db();
    const found = await sql`SELECT id,public_id,event_slug,owner_name,category_name,status,used_at FROM tickets WHERE qr_token=${token} LIMIT 1`;
    if (!found[0]) return NextResponse.json({ result: "not_found" }, { status: 404 });
    const ticket = found[0];
    const actor = await requireAdminPermission("scan_tickets", String(ticket.event_slug));

    if (ticket.status === "used") {
      return NextResponse.json({ result: "already_used", ticket });
    }
    if (ticket.status !== "valid") {
      return NextResponse.json({ result: "invalid", ticket });
    }

    const updated = await sql`
      UPDATE tickets SET status='used',used_at=now(),used_by=${actor.userId}
      WHERE id=${ticket.id} AND status='valid'
      RETURNING id,public_id,event_slug,owner_name,category_name,status,used_at
    `;
    if (!updated[0]) {
      const latest = await sql`SELECT id,public_id,event_slug,owner_name,category_name,status,used_at FROM tickets WHERE id=${ticket.id}`;
      return NextResponse.json({ result: latest[0]?.status === "used" ? "already_used" : "invalid", ticket: latest[0] });
    }
    await writeAdminAudit(actor.userId, "ticket.scan", "ticket", String(ticket.id), { publicId: String(ticket.public_id), eventSlug: String(ticket.event_slug) });
    return NextResponse.json({ result: "accepted", ticket: updated[0] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка сканирования" }, { status });
  }
}
