import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

function mapPhoto(row: any) {
  return {
    id: String(row.id),
    eventSlug: String(row.event_slug),
    eventTitle: String(row.event_title || row.event_slug),
    src: String(row.url),
    caption: String(row.caption || ""),
  };
}

async function listFavorites(userId: string) {
  const sql = db();
  const rows = await sql`
    SELECT p.id, p.event_slug, p.url, p.caption, e.title AS event_title
    FROM photo_favorites f
    JOIN media_photos p ON p.id=f.photo_id
    LEFT JOIN events e ON e.slug=p.event_slug
    WHERE f.user_id=${userId} AND p.is_published=true
    ORDER BY f.created_at DESC
  `;
  const photos = rows.map(mapPhoto);
  return { ids: photos.map((photo) => photo.id), photos };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Нужно войти", ids: [], photos: [] }, { status: 401 });
    return NextResponse.json(await listFavorites(String(user.id)));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось загрузить избранное" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

    const body = await request.json();
    const photoId = String(body.photoId ?? "").trim();
    if (!photoId) return NextResponse.json({ error: "Не указана фотография" }, { status: 400 });

    const sql = db();
    const photoRows = await sql`
      SELECT p.id, p.event_slug, p.url, p.caption, e.title AS event_title
      FROM media_photos p
      LEFT JOIN events e ON e.slug=p.event_slug
      WHERE p.id::text=${photoId} AND p.is_published=true
      LIMIT 1
    `;
    if (!photoRows[0]) return NextResponse.json({ error: "Фотография не найдена" }, { status: 404 });

    const desiredActive = body.active === undefined ? null : Boolean(body.active);
    let active: boolean;

    if (desiredActive === true) {
      await sql`
        INSERT INTO photo_favorites(user_id,photo_id)
        VALUES(${user.id},${photoRows[0].id})
        ON CONFLICT DO NOTHING
      `;
      active = true;
    } else if (desiredActive === false) {
      await sql`DELETE FROM photo_favorites WHERE user_id=${user.id} AND photo_id=${photoRows[0].id}`;
      active = false;
    } else {
      const existing = await sql`
        SELECT 1 FROM photo_favorites
        WHERE user_id=${user.id} AND photo_id=${photoRows[0].id}
        LIMIT 1
      `;
      if (existing[0]) {
        await sql`DELETE FROM photo_favorites WHERE user_id=${user.id} AND photo_id=${photoRows[0].id}`;
        active = false;
      } else {
        await sql`
          INSERT INTO photo_favorites(user_id,photo_id)
          VALUES(${user.id},${photoRows[0].id})
          ON CONFLICT DO NOTHING
        `;
        active = true;
      }
    }

    return NextResponse.json({ ok: true, active, photo: mapPhoto(photoRows[0]) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось изменить избранное" }, { status: 500 });
  }
}
