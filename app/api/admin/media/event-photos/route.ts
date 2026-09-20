import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

export const runtime = "nodejs";

function isManagedBlob(url:string){ try{return new URL(url).hostname.endsWith("blob.vercel-storage.com");}catch{return false;} }

export async function DELETE(request:Request){
  try{
    const body=await request.json(); const eventSlug=String(body.eventSlug||"").trim().slice(0,180);
    if(!eventSlug)return NextResponse.json({error:"Мероприятие не указано"},{status:400});
    const actor=await requireAdminPermission("manage_media",eventSlug); const sql=db();
    const rows=await sql`SELECT id,url FROM media_photos WHERE event_slug=${eventSlug}`;
    await sql`DELETE FROM media_photos WHERE event_slug=${eventSlug}`;
    const token=resolveBlobToken();
    if(token){const urls=rows.map((row:any)=>String(row.url||"")).filter(isManagedBlob);if(urls.length){try{await del(urls,{token});}catch(error){console.warn("Bulk blob delete:",error instanceof Error?error.message:error);}}}
    await writeAdminAudit(actor.userId,"media.photo.delete_all","event",eventSlug,{count:rows.length});
    return NextResponse.json({ok:true,deleted:rows.length});
  }catch(error){const status=error instanceof AdminAccessError?error.status:500;return NextResponse.json({error:error instanceof Error?error.message:"Не удалось удалить фотографии"},{status});}
}
