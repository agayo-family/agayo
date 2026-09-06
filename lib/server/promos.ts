import { db } from "./db";

export type PromoCalculation = { code:string; discount:number; total:number; discountType:"fixed"|"percent"; discountValue:number };

export async function calculatePromo(codeInput:string,eventSlug:string,subtotal:number): Promise<PromoCalculation | null> {
  const code=String(codeInput||"").trim().toUpperCase(); if(!code) return null;
  const sql=db();
  const rows=await sql`
    SELECT code,discount_type,discount_value,usage_limit,used_count
    FROM promo_codes
    WHERE upper(code)=${code}
      AND is_active=true
      AND (event_slug IS NULL OR event_slug=${eventSlug})
      AND (starts_at IS NULL OR starts_at<=now())
      AND (expires_at IS NULL OR expires_at>now())
      AND (usage_limit IS NULL OR used_count<usage_limit)
    LIMIT 1
  `;
  const promo=rows[0]; if(!promo) return null;
  const discountType=promo.discount_type === "fixed" ? "fixed" : "percent";
  const value=Math.max(0,Number(promo.discount_value)||0);
  const discount=discountType === "percent" ? Math.floor(subtotal*Math.min(value,100)/100) : Math.min(value,subtotal);
  return { code:String(promo.code),discount,total:Math.max(0,subtotal-discount),discountType,discountValue:value };
}
