import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { AdminAccessError, requireAdminPermission } from "@/lib/server/admin";
import { resolveBlobToken } from "@/lib/server/blob";

export const runtime="nodejs";
export async function POST(request:Request){
  try{
    await requireAdminPermission("manage_loyalty"); const token=resolveBlobToken(); if(!token)return NextResponse.json({error:"Vercel Blob не подключён"},{status:503});
    const data=await request.formData(); const file=data.get("file"); if(!(file instanceof File))return NextResponse.json({error:"Файл не выбран"},{status:400});
    if(!file.type.startsWith("image/"))return NextResponse.json({error:"Нужно изображение"},{status:400}); if(file.size>10*1024*1024)return NextResponse.json({error:"Изображение больше 10 МБ"},{status:413});
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-").slice(-160)||"level.jpg"; const blob=await put(`loyalty/${Date.now()}-${safe}`,file,{access:"public",addRandomSuffix:true,token});
    return NextResponse.json({ok:true,url:blob.url});
  }catch(error){const status=error instanceof AdminAccessError?error.status:500;return NextResponse.json({error:error instanceof Error?error.message:"Не удалось загрузить изображение"},{status});}
}
