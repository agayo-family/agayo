import { NextResponse } from "next/server";
import { getEventServer } from "@/lib/server/events";
import { getEventCatalogBadge } from "@/lib/events";
import { calculatePromo } from "@/lib/server/promos";

export async function POST(request:Request){
  try{
    const body=await request.json(); const event=await getEventServer(String(body.eventSlug||""));
    const category=event?.tickets.find((item)=>item.id===String(body.categoryId||"")); const quantity=Math.max(1,Math.min(6,Number(body.quantity)||1));
    if(!event||event.status!=="published"||getEventCatalogBadge(event)!=="tickets"||!category||category.soldOut) return NextResponse.json({error:"Билет недоступен"},{status:400});
    const subtotal=category.price*quantity; const promo=await calculatePromo(String(body.promo||""),event.slug,subtotal);
    if(!promo) return NextResponse.json({error:"Промокод не найден или больше не действует"},{status:400});
    if(promo.total<=0) return NextResponse.json({error:"Промокод не может снижать публичный заказ до 0 ₽. Уменьши скидку."},{status:400});
    return NextResponse.json({ok:true,subtotal,...promo});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Не удалось проверить промокод"},{status:500});}
}
