import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

export async function POST(request: Request){
  try{
    await requireAdminPermission("manage_events");
    const token=resolveBlobToken();
    if(!token) return NextResponse.json({error:"Хранилище афиш ещё не подключено. Подключи Vercel Blob к проекту — остальные изменения мероприятия уже можно сохранять без афиши."},{status:503});
    const data=await request.formData(); const file=data.get("file");
    if(!(file instanceof File)) return NextResponse.json({error:"Файл не выбран"},{status:400});
    if(file.size>12*1024*1024) return NextResponse.json({error:"Афиша больше 12 МБ"},{status:400});
    if(!file.type.startsWith("image/")) return NextResponse.json({error:"Нужен файл изображения"},{status:400});
    const blob=await put(`event-posters/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`,file,{access:"public",addRandomSuffix:true,token});
    return NextResponse.json({ok:true,url:blob.url});
  }catch(error){
    const status=error instanceof AdminAccessError?error.status:500;
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось загрузить афишу"},{status});
  }
}
