import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

function text(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function integer(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function canManageGlobal(access: Awaited<ReturnType<typeof requireAdminPermission>>) { return access.role === "owner" || access.allEvents; }
function isManagedBlob(url: string) { try { const host = new URL(url).hostname; return host.endsWith("blob.vercel-storage.com"); } catch { return false; } }

export async function GET() {
  try {
    const access = await requireAdminPermission("manage_media");
    const sql = db();
    const [photos, reviews] = await Promise.all([
      sql`SELECT id,event_slug,url,caption,sort_order,is_featured,is_published,created_at FROM media_photos ORDER BY event_slug,sort_order,created_at DESC`,
      sql`SELECT id,event_slug,author,body,audio_url,sort_order,is_featured,is_published,created_at FROM media_reviews ORDER BY is_featured DESC,sort_order,created_at DESC`,
    ]);
    return NextResponse.json({
      photos: photos.filter((row:any) => canAccessEvent(access, String(row.event_slug))),
      reviews: reviews.filter((row:any) => !row.event_slug ? canManageGlobal(access) : canAccessEvent(access, String(row.event_slug))),
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить медиатеку" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === "review" ? "review" : "photo";
    const eventSlug = text(body.eventSlug, 180) || null;
    const access = await requireAdminPermission("manage_media", eventSlug);
    const sql = db();

    if (type === "photo") {
      if (!eventSlug) return NextResponse.json({ error: "Выбери мероприятие" }, { status: 400 });
      const url = text(body.url, 2000); if (!url) return NextResponse.json({ error: "Фотография не загружена" }, { status: 400 });
      const rows = await sql`
        INSERT INTO media_photos(event_slug,url,caption,sort_order,is_featured,is_published,created_by)
        VALUES(${eventSlug},${url},${text(body.caption,500)},${integer(body.sortOrder,0)},${Boolean(body.isFeatured)},${body.isPublished !== false},${access.userId})
        ON CONFLICT (url) DO UPDATE SET event_slug=EXCLUDED.event_slug,caption=EXCLUDED.caption,updated_at=now()
        RETURNING id,event_slug,url,caption,sort_order,is_featured,is_published,created_at
      `;
      if (Boolean(body.isFeatured)) await sql`UPDATE media_photos SET is_featured=false,updated_at=now() WHERE event_slug=${eventSlug} AND id<>${rows[0].id}`;
      await writeAdminAudit(access.userId,"media.photo.create","media_photo",String(rows[0].id),{eventSlug});
      return NextResponse.json({ ok:true, photo:rows[0] });
    }

    if (!eventSlug && !canManageGlobal(access)) return NextResponse.json({ error: "Глобальный отзыв доступен только администратору со всеми событиями" }, { status:403 });
    if (Boolean(body.isFeatured) && !canManageGlobal(access)) return NextResponse.json({ error: "Главный отзыв может назначить только глобальный администратор" }, { status:403 });
    const author = text(body.author,120); const reviewBody = text(body.body,2000); const audioUrl = text(body.audioUrl,2000) || null;
    if (!author) return NextResponse.json({ error: "Укажи автора" }, { status:400 });
    if (!reviewBody && !audioUrl) return NextResponse.json({ error: "Добавь текст или аудио" }, { status:400 });
    if (Boolean(body.isFeatured)) await sql`UPDATE media_reviews SET is_featured=false,updated_at=now() WHERE is_featured=true`;
    const rows = await sql`
      INSERT INTO media_reviews(event_slug,author,body,audio_url,sort_order,is_featured,is_published,created_by)
      VALUES(${eventSlug},${author},${reviewBody},${audioUrl},${integer(body.sortOrder,0)},${Boolean(body.isFeatured)},${body.isPublished !== false},${access.userId})
      RETURNING id,event_slug,author,body,audio_url,sort_order,is_featured,is_published,created_at
    `;
    await writeAdminAudit(access.userId,"media.review.create","media_review",String(rows[0].id),{eventSlug,author});
    return NextResponse.json({ ok:true, review:rows[0] });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить" }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json(); const type = body.type === "review" ? "review" : "photo"; const id = text(body.id,80);
    if (!id) return NextResponse.json({ error:"Не указан объект" },{status:400});
    const sql = db();
    if (type === "photo") {
      const current = await sql`SELECT * FROM media_photos WHERE id=${id} LIMIT 1`; if (!current[0]) return NextResponse.json({error:"Фото не найдено"},{status:404});
      const eventSlug = text(body.eventSlug ?? current[0].event_slug,180);
      const access = await requireAdminPermission("manage_media", eventSlug);
      if (!canAccessEvent(access,String(current[0].event_slug))) return NextResponse.json({error:"Нет доступа к исходному мероприятию"},{status:403});
      const featured = body.isFeatured == null ? Boolean(current[0].is_featured) : Boolean(body.isFeatured);
      if (featured) await sql`UPDATE media_photos SET is_featured=false,updated_at=now() WHERE event_slug=${eventSlug} AND id<>${id}`;
      const rows = await sql`UPDATE media_photos SET event_slug=${eventSlug},caption=${text(body.caption ?? current[0].caption,500)},sort_order=${integer(body.sortOrder,current[0].sort_order)},is_featured=${featured},is_published=${body.isPublished == null ? Boolean(current[0].is_published) : Boolean(body.isPublished)},updated_at=now() WHERE id=${id} RETURNING id,event_slug,url,caption,sort_order,is_featured,is_published,created_at`;
      await writeAdminAudit(access.userId,"media.photo.update","media_photo",id,{eventSlug});
      return NextResponse.json({ok:true,photo:rows[0]});
    }
    const current = await sql`SELECT * FROM media_reviews WHERE id=${id} LIMIT 1`; if (!current[0]) return NextResponse.json({error:"Отзыв не найден"},{status:404});
    const eventSlug = text(body.eventSlug ?? current[0].event_slug,180) || null;
    const access = await requireAdminPermission("manage_media", eventSlug);
    if (current[0].event_slug && !canAccessEvent(access,String(current[0].event_slug))) return NextResponse.json({error:"Нет доступа к исходному мероприятию"},{status:403});
    if (!eventSlug && !canManageGlobal(access)) return NextResponse.json({error:"Глобальный отзыв доступен только глобальному администратору"},{status:403});
    const featured = body.isFeatured == null ? Boolean(current[0].is_featured) : Boolean(body.isFeatured);
    if (featured && !canManageGlobal(access)) return NextResponse.json({error:"Главный отзыв может назначить только глобальный администратор"},{status:403});
    if (featured) await sql`UPDATE media_reviews SET is_featured=false,updated_at=now() WHERE is_featured=true AND id<>${id}`;
    const author=text(body.author ?? current[0].author,120); const reviewBody=text(body.body ?? current[0].body,2000); const audioUrl=text(body.audioUrl ?? current[0].audio_url,2000)||null;
    if (!author || (!reviewBody && !audioUrl)) return NextResponse.json({error:"Укажи автора и текст или аудио"},{status:400});
    const rows=await sql`UPDATE media_reviews SET event_slug=${eventSlug},author=${author},body=${reviewBody},audio_url=${audioUrl},sort_order=${integer(body.sortOrder,current[0].sort_order)},is_featured=${featured},is_published=${body.isPublished == null ? Boolean(current[0].is_published) : Boolean(body.isPublished)},updated_at=now() WHERE id=${id} RETURNING id,event_slug,author,body,audio_url,sort_order,is_featured,is_published,created_at`;
    await writeAdminAudit(access.userId,"media.review.update","media_review",id,{eventSlug,author});
    return NextResponse.json({ok:true,review:rows[0]});
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось изменить" }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json(); const type=body.type === "review" ? "review" : "photo"; const id=text(body.id,80); const sql=db();
    if(type === "photo"){
      const rows=await sql`SELECT * FROM media_photos WHERE id=${id} LIMIT 1`; if(!rows[0]) return NextResponse.json({error:"Фото не найдено"},{status:404});
      const access=await requireAdminPermission("manage_media",String(rows[0].event_slug));
      await sql`DELETE FROM media_photos WHERE id=${id}`;
      const url=String(rows[0].url); const token=resolveBlobToken(); if(token && isManagedBlob(url)) { try { await del(url,{token}); } catch {} }
      await writeAdminAudit(access.userId,"media.photo.delete","media_photo",id,{eventSlug:String(rows[0].event_slug)});
      return NextResponse.json({ok:true});
    }
    const rows=await sql`SELECT * FROM media_reviews WHERE id=${id} LIMIT 1`; if(!rows[0]) return NextResponse.json({error:"Отзыв не найден"},{status:404});
    const access=await requireAdminPermission("manage_media",rows[0].event_slug ? String(rows[0].event_slug) : null);
    if(!rows[0].event_slug && !canManageGlobal(access)) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    await sql`DELETE FROM media_reviews WHERE id=${id}`;
    const url=rows[0].audio_url ? String(rows[0].audio_url) : ""; const token=resolveBlobToken(); if(token && isManagedBlob(url)) { try { await del(url,{token}); } catch {} }
    await writeAdminAudit(access.userId,"media.review.delete","media_review",id,{eventSlug:rows[0].event_slug ? String(rows[0].event_slug) : null});
    return NextResponse.json({ok:true});
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить" }, { status });
  }
}
