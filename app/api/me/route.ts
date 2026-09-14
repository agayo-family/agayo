import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export async function GET() {
  return NextResponse.json({ user: await getCurrentUser() });
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Нужно войти в AGAYO ID" }, { status: 401 });

    const body = await request.json();
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);
    if (firstName.length > 60 || lastName.length > 60) {
      return NextResponse.json({ error: "Имя и фамилия — максимум 60 символов" }, { status: 400 });
    }

    const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const sql = db();
    const rows = await sql`
      UPDATE users
      SET first_name=${firstName || null},
          last_name=${lastName || null},
          display_name=${displayName},
          updated_at=now()
      WHERE id=${user.id}
      RETURNING id, agayo_id, email, phone, first_name, last_name, display_name, loyalty_level, loyalty_override_level
    `;

    return NextResponse.json({ ok: true, user: rows[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить профиль" }, { status: 500 });
  }
}
