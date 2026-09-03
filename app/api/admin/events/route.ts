import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { ensureSeedEvents } from "@/lib/server/seed-events";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `event-${Date.now()}`;
}
function cleanHex(value: unknown, fallback: string) { const s=String(value||"").trim(); return /^#[0-9a-f]{6}$/i.test(s)?s:fallback; }

export async function GET() {
  try {
    await requireAdminPermission("manage_events");
    await ensureSeedEvents();
    const sql=db();
    const rows=await sql`SELECT id,slug,title,starts_at,ends_at,status,sales_state,ticket_mode,poster_image,theme_primary,theme_secondary,theme_accent FROM events ORDER BY starts_at DESC`;
    return NextResponse.json({ events: rows });
  } catch(error) { const status=error instanceof AdminAccessError?error.status:500; return NextResponse.json({error:error instanceof Error?error.message:"Ошибка"},{status}); }
}

export async function POST(request: Request) {
  try {
    const body=await request.json();
    const desiredStatus=body.status === "published" ? "published" : "draft";
    const actor=await requireAdminPermission(desiredStatus === "published" ? "publish_events" : "manage_events");
    const title=String(body.title||"").trim();
    if(title.length<2) return NextResponse.json({error:"Укажи название мероприятия"},{status:400});
    const startsAt=new Date(String(body.startsAt||""));
    if(Number.isNaN(startsAt.valueOf())) return NextResponse.json({error:"Укажи дату и время начала"},{status:400});
    const endsAt=body.endsAt ? new Date(String(body.endsAt)) : null;
    const sql=db();
    let slug=slugify(String(body.slug||title));
    const occupied=await sql`SELECT 1 FROM events WHERE slug=${slug} LIMIT 1`;
    if(occupied[0]) slug=`${slug}-${String(Date.now()).slice(-5)}`;
    const inserted=await sql`
      INSERT INTO events(slug,title,starts_at,ends_at,age_label,city,venue,address,alcohol_free,status,sales_state,ticket_mode,hero_image,poster_image,theme_primary,theme_secondary,theme_accent,description,secondary_description,created_by)
      VALUES(${slug},${title},${startsAt.toISOString()},${endsAt?endsAt.toISOString():null},${String(body.ageLabel||"14+")},${String(body.city||"Йошкар-Ола")},${String(body.venue||"")||null},${String(body.address||"")||null},true,${desiredStatus},${body.salesState==="open"?"open":body.salesState==="closed"?"closed":"coming-soon"},${["zones","seats"].includes(body.ticketMode)?body.ticketMode:"general-admission"},${String(body.posterImage||"")||null},${String(body.posterImage||"")||null},${cleanHex(body.themePrimary,"#220708")},${cleanHex(body.themeSecondary,"#751013")},${cleanHex(body.themeAccent,"#e12622")},${String(body.description||"")},${String(body.secondaryDescription||"")},${actor.userId}) RETURNING id,slug
    `;
    const eventId=String(inserted[0].id);
    const categories=Array.isArray(body.tickets)?body.tickets.slice(0,20):[];
    const program=Array.isArray(body.program)?body.program.slice(0,40):[];
    for(let i=0;i<categories.length;i++){
      const item=categories[i]; if(!item?.name) continue;
      await sql`INSERT INTO event_ticket_categories(event_id,category_key,name,price,note,inventory,hot_enabled,hot_displayed_remaining,theme_primary,theme_secondary,theme_accent,sort_order)
        VALUES(${eventId},${slugify(String(item.id||item.name))},${String(item.name)},${Math.max(0,Number(item.price)||0)},${String(item.note||"")},${item.inventory === "" || item.inventory == null ? null : Math.max(0,Number(item.inventory)||0)},${Boolean(item.hotEnabled)},${null},${cleanHex(item.themePrimary,cleanHex(body.themePrimary,"#220708"))},${cleanHex(item.themeSecondary,cleanHex(body.themeSecondary,"#751013"))},${cleanHex(item.themeAccent,cleanHex(body.themeAccent,"#e12622"))},${i})`;
    }
    for(let i=0;i<program.length;i++){
      const item=program[i]; const label=String(item?.timeLabel||"").trim(); const titleText=String(item?.title||"").trim();
      if(!titleText) continue;
      await sql`INSERT INTO event_program_items(event_id,time_label,title,sort_order) VALUES(${eventId},${label},${titleText},${i})`;
    }
    await writeAdminAudit(actor.userId,"event.create","event",eventId,{slug,title,status:desiredStatus});
    return NextResponse.json({ok:true,slug,id:eventId});
  } catch(error){ console.error(error); const status=error instanceof AdminAccessError?error.status:500; return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать мероприятие"},{status}); }
}
