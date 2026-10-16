import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invalidatePublicContent } from "@/lib/server/public-content";
import { db } from "@/lib/server/db";
import { AdminAccessError, canAccessEvent, requireAdminPermission } from "@/lib/server/admin";
import { ensureSeedEvents } from "@/lib/server/seed-events";
import { ensureHotTicketSchema } from "@/lib/server/hot-tickets";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `event-${Date.now()}`;
}
function cleanHex(value: unknown, fallback: string) { const s=String(value||"").trim(); return /^#[0-9a-f]{6}$/i.test(s)?s:fallback; }

export async function GET() {
  try {
    const access = await requireAdminPermission("manage_events");
    await ensureSeedEvents();
    const sql=db();
    const rows=await sql`SELECT id,slug,title,starts_at,ends_at,status,sales_state,ticket_mode,poster_image,theme_primary,theme_secondary,theme_accent FROM events e
      WHERE (to_jsonb(e)->>'deleted_at') IS NULL ORDER BY starts_at DESC`;
    return NextResponse.json({ events: rows.filter(event => canAccessEvent(access, String(event.slug))) });
  } catch(error) { const status=error instanceof AdminAccessError?error.status:500; return NextResponse.json({error:error instanceof Error?error.message:"Ошибка"},{status}); }
}

export async function POST(request: Request) {
  try {
    const body=await request.json();
    const desiredStatus=body.status === "published" ? "published" : "draft";
    const actor=await requireAdminPermission(desiredStatus === "published" ? "publish_events" : "manage_events");
    if (actor.role !== 'owner' && !actor.allEvents) throw new AdminAccessError('Создавать мероприятия может сотрудник с доступом ко всем событиям', 403);
    const title=String(body.title||"").trim();
    if(title.length<2) return NextResponse.json({error:"Укажи название мероприятия"},{status:400});
    const startsAt=new Date(String(body.startsAt||""));
    if(Number.isNaN(startsAt.valueOf())) return NextResponse.json({error:"Укажи дату и время начала"},{status:400});
    const endsAt=body.endsAt ? new Date(String(body.endsAt)) : null;
    const sql=db();
    await ensureHotTicketSchema(sql);
    const created = await sql.begin(async (tx: any) => {
    let slug=slugify(String(body.slug||title));
    const occupied=await tx`SELECT 1 FROM events WHERE slug=${slug} LIMIT 1`;
    if(occupied[0]) slug=`${slug}-${String(Date.now()).slice(-5)}`;
    const inserted=await tx`
      INSERT INTO events(slug,title,starts_at,ends_at,age_label,city,venue,address,alcohol_free,status,sales_state,ticket_mode,hero_image,poster_image,theme_primary,theme_secondary,theme_accent,description,secondary_description,event_rules,created_by)
      VALUES(${slug},${title},${startsAt.toISOString()},${endsAt?endsAt.toISOString():null},${String(body.ageLabel||"14+")},${String(body.city||"Йошкар-Ола")},${String(body.venue||"")||null},${String(body.address||"")||null},true,${desiredStatus},${body.salesState==="open"?"open":body.salesState==="closed"?"closed":"coming-soon"},${["zones","seats"].includes(body.ticketMode)?body.ticketMode:"general-admission"},${String(body.posterImage||"")||null},${String(body.posterImage||"")||null},${cleanHex(body.themePrimary,"#220708")},${cleanHex(body.themeSecondary,"#751013")},${cleanHex(body.themeAccent,"#e12622")},${String(body.description||"")},${String(body.secondaryDescription||"")},${String(body.eventRules||"")},${actor.userId}) RETURNING id,slug
    `;
    const eventId=String(inserted[0].id);
    const categories=Array.isArray(body.tickets)?body.tickets.slice(0,20):[];
    const program=Array.isArray(body.program)?body.program.slice(0,40):[];
    for(let i=0;i<categories.length;i++){
      const item=categories[i]; if(!item?.name) continue;
      await tx`INSERT INTO event_ticket_categories(event_id,category_key,name,price,note,inventory,hot_enabled,hot_displayed_remaining,hot_batch_started_at,theme_primary,theme_secondary,theme_accent,sort_order)
        VALUES(${eventId},${slugify(String(item.id||item.name))},${String(item.name)},${Math.max(0,Number(item.price)||0)},${String(item.note||"")},${item.inventory === "" || item.inventory == null ? null : Math.max(0,Number(item.inventory)||0)},${Boolean(item.hotEnabled)},${null},CASE WHEN ${Boolean(item.hotEnabled)} THEN now() ELSE NULL END,${cleanHex(item.themePrimary,cleanHex(body.themePrimary,"#220708"))},${cleanHex(item.themeSecondary,cleanHex(body.themeSecondary,"#751013"))},${cleanHex(item.themeAccent,cleanHex(body.themeAccent,"#e12622"))},${i})`;
    }
    for(let i=0;i<program.length;i++){
      const item=program[i]; const label=String(item?.timeLabel||"").trim(); const titleText=String(item?.title||"").trim();
      if(!titleText) continue;
      await tx`INSERT INTO event_program_items(event_id,time_label,title,sort_order) VALUES(${eventId},${label},${titleText},${i})`;
    }
    await tx`INSERT INTO admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actor.userId},'event.create','event',${eventId},${JSON.stringify({slug,title,status:desiredStatus})}::text::jsonb)`;
    return { id: eventId, slug };
    });
    invalidatePublicContent("events");
    revalidatePath("/events");
    revalidatePath(`/events/${created.slug}`);
    return NextResponse.json({ok:true,slug:created.slug,id:created.id});
  } catch(error){ console.error(error); const status=error instanceof AdminAccessError?error.status:500; return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать мероприятие"},{status}); }
}
