const SAFE_FIELDS = ['id','public_id','event_slug','owner_name','category_id','category_name','status','zone','seat','used_at','created_at','email','phone','agayo_id','order_id','order_public_id','order_status','order_email','paid_at','event_starts_at','ticket_refund_status','order_ticket_count','legal_version'] as const;
const AMOUNTS = ['subtotal','unit_price','total','refunded_amount','paid_share','refund_quote_amount','npd_receipt_amount','ticket_refund_amount'] as const;
const FINANCIAL_IDS = ['yookassa_payment_id','npd_receipt_status','npd_receipt_id','npd_receipt_url','ticket_refund_id','ticket_refund_yookassa_id','ticket_refund_percent'] as const;
export function adminTicketView(row: Record<string, unknown>, canRevenue: boolean) {
  const result: Record<string, unknown> = {};
  for (const field of SAFE_FIELDS) result[field] = row[field] ?? null;
  for (const field of AMOUNTS) result[field] = canRevenue ? Number(row[field] || 0) : 0;
  for (const field of FINANCIAL_IDS) result[field] = canRevenue ? row[field] ?? null : null;
  const request = row.refund_request as Record<string, unknown> | null;
  if (canRevenue && request) {
    const payload = request.request_payload as Record<string, unknown>;
    result.refund_request = { id: request.id, ticket_id: request.ticket_id, status: request.status, amount: Number(payload.amount), reason: String(request.reason || '') };
  } else result.refund_request = null;
  for (const field of ['refund_quote_percent','refund_quote_label','days_before_event']) result[field] = row[field] ?? null;
  return result;
}
