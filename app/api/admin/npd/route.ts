import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { AdminAccessError, requireAdminPermission, writeAdminAudit } from "@/lib/server/admin";
import { sendNpdReceiptEmail } from "@/lib/server/email";

export const dynamic="force-dynamic";

function text(value:unknown,max=1500){return String(value??"").trim().slice(0,max);}

export async function PATCH(request:Request){
  try{
    const body=await request.json();
    const orderId=text(body.orderId,80);
    const action=text(body.action,40);
    if(!orderId) return NextResponse.json({error:"Заказ не указан"},{status:400});
    const sql=db();
    const [order]=await sql`SELECT id,public_id,event_slug,email,status,total,refunded_amount,npd_receipt_status,npd_receipt_amount FROM orders WHERE id=${orderId} LIMIT 1`;
    if(!order) return NextResponse.json({error:"Заказ не найден"},{status:404});
    const actor=await requireAdminPermission("view_revenue",String(order.event_slug));

    if(action==="register"){
      if(!['required','reissue_required','registered'].includes(String(order.npd_receipt_status))) return NextResponse.json({error:"Для этого заказа сейчас не требуется регистрация чека НПД"},{status:409});
      const receiptId=text(body.receiptId,200);
      const receiptUrl=text(body.receiptUrl,1500);
      if(!receiptId&&!receiptUrl) return NextResponse.json({error:"Вставь номер или ссылку на чек из «Мой налог»"},{status:400});
      if(receiptUrl){
        try{const url=new URL(receiptUrl);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{return NextResponse.json({error:"Некорректная ссылка на чек"},{status:400});}
      }
      const [updated]=await sql`
        UPDATE orders
        SET npd_receipt_status='registered',npd_receipt_id=${receiptId||null},npd_receipt_url=${receiptUrl||null},
            npd_receipt_amount=COALESCE(npd_receipt_amount,GREATEST(0,total-refunded_amount)),npd_receipt_updated_at=now()
        WHERE id=${orderId}
        RETURNING id,public_id,npd_receipt_status,npd_receipt_id,npd_receipt_url,npd_receipt_amount
      `;
      await writeAdminAudit(actor.userId,"npd.receipt.register","order",orderId,{orderPublicId:String(order.public_id),receiptId:receiptId||null,receiptUrl:receiptUrl||null,amount:Number(updated.npd_receipt_amount||0)});
      let emailWarning="";
      if(order.email){
        try{await sendNpdReceiptEmail(String(order.email),{orderPublicId:String(order.public_id),amount:Number(updated.npd_receipt_amount||0),receiptId:receiptId||null,receiptUrl:receiptUrl||null});}
        catch(error){emailWarning=` Email покупателю не отправлен: ${error instanceof Error?error.message:"ошибка"}`;}
      }
      return NextResponse.json({ok:true,order:updated,message:`Чек НПД сохранён. Покупателю отправлено письмо с реквизитами чека.${emailWarning}`});
    }

    if(action==="cancelled"){
      if(String(order.npd_receipt_status)!=='cancel_required') return NextResponse.json({error:"Для этого заказа сейчас не требуется аннулирование чека"},{status:409});
      const [updated]=await sql`
        UPDATE orders
        SET npd_receipt_status='cancelled',npd_receipt_amount=0,npd_receipt_updated_at=now()
        WHERE id=${orderId}
        RETURNING id,public_id,npd_receipt_status,npd_receipt_id,npd_receipt_url,npd_receipt_amount
      `;
      await writeAdminAudit(actor.userId,"npd.receipt.cancelled","order",orderId,{orderPublicId:String(order.public_id)});
      return NextResponse.json({ok:true,order:updated,message:"Аннулирование чека НПД зафиксировано."});
    }

    if(action==="reset"){
      const remaining=Math.max(0,Math.round((Number(order.total||0)-Number(order.refunded_amount||0))*100)/100);
      const next=remaining>0?'required':'not_required';
      const [updated]=await sql`
        UPDATE orders
        SET npd_receipt_status=${next},npd_receipt_id=NULL,npd_receipt_url=NULL,npd_receipt_amount=${remaining},npd_receipt_updated_at=now()
        WHERE id=${orderId}
        RETURNING id,public_id,npd_receipt_status,npd_receipt_id,npd_receipt_url,npd_receipt_amount
      `;
      await writeAdminAudit(actor.userId,"npd.receipt.reset","order",orderId,{orderPublicId:String(order.public_id),remaining});
      return NextResponse.json({ok:true,order:updated,message:"Статус чека НПД сброшен."});
    }

    return NextResponse.json({error:"Неизвестное действие"},{status:400});
  }catch(error){
    const status=error instanceof AdminAccessError?error.status:500;
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить чек НПД"},{status});
  }
}
