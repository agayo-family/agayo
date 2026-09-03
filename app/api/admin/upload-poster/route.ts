import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
export async function POST(request: Request){
 try{
  await requireAdminPermission("manage_events");
  if(!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({error:"Хранилище афиш ещё не подключено. Добавь BLOB_READ_WRITE_TOKEN в Vercel."},{status:503});
  const data=await request.formData(); const file=data.get("file");
  if(!(file instanceof File)) return NextResponse.json({error:"Файл не выбран"},{status:400});
  if(file.size>12*1024*1024) return NextResponse.json({error:"Афиша больше 12 МБ"},{status:400});
  if(!file.type.startsWith("image/")) return NextResponse.json({error:"Нужен файл изображения"},{status:400});
  const blob=await put(`event-posters/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`,file,{access:"public",addRandomSuffix:true});
  return NextResponse.json({ok:true,url:blob.url});
 }catch(error){const status=error instanceof AdminAccessError?error.status:500; return NextResponse.json({error:error instanceof Error?error.message:"Не удалось загрузить афишу"},{status});}
}
