import { db } from "./db";

export async function markNpdReceiptRequired(orderId:string, amount:number, tx?:any) {
  const sql=tx||db();
  await sql`
    UPDATE orders
    SET npd_receipt_status=CASE
          WHEN npd_receipt_status='registered' THEN npd_receipt_status
          ELSE 'required'
        END,
        npd_receipt_amount=${Math.max(0,Math.round(amount*100)/100)},
        npd_receipt_updated_at=now()
    WHERE id=${orderId}
  `;
}

export async function markNpdAfterRefund(orderId:string, remainingAmount:number, tx?:any) {
  const sql=tx||db();
  const remaining=Math.max(0,Math.round(Number(remainingAmount||0)*100)/100);
  await sql`
    UPDATE orders
    SET npd_receipt_status=CASE
          WHEN ${remaining} <= 0 THEN
            CASE WHEN npd_receipt_status IN ('registered','reissue_required','cancel_required') THEN 'cancel_required' ELSE 'not_required' END
          ELSE
            CASE WHEN npd_receipt_status IN ('registered','reissue_required','cancel_required','cancelled') THEN 'reissue_required' ELSE 'required' END
        END,
        npd_receipt_amount=${remaining},
        npd_receipt_updated_at=now()
    WHERE id=${orderId}
  `;
}
