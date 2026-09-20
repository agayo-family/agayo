import { db } from "./db";

type Sql = ReturnType<typeof db> | any;

export async function getTicketPaidShare(orderId: string, ticketId: string, sql: Sql = db()) {
  const [order] = await sql`
    SELECT id,total,subtotal
    FROM orders
    WHERE id=${orderId}
    LIMIT 1
  `;
  if (!order) return null;

  const tickets = await sql`
    SELECT id,category_id,created_at
    FROM tickets
    WHERE order_id=${orderId}
    ORDER BY created_at,id
  `;
  if (!tickets.length) return null;

  const items = await sql`
    SELECT ticket_category_id,unit_price,quantity
    FROM order_items
    WHERE order_id=${orderId}
  `;
  const priceByCategory = new Map(items.map((item:any) => [String(item.ticket_category_id), Number(item.unit_price || 0)]));
  const bases = tickets.map((ticket:any) => ({
    id:String(ticket.id),
    base:Math.max(0, Number(priceByCategory.get(String(ticket.category_id)) || 0)),
  }));

  let baseTotal = bases.reduce((sum:number,item:any)=>sum+item.base,0);
  if (baseTotal <= 0) baseTotal = Number(order.subtotal || 0);
  const totalCents = Math.max(0, Math.round(Number(order.total || 0) * 100));
  let allocated = 0;
  const shares = new Map<string,number>();

  bases.forEach((item:any,index:number) => {
    let cents:number;
    if (index === bases.length - 1) cents = Math.max(0,totalCents - allocated);
    else if (baseTotal > 0) cents = Math.max(0,Math.floor(totalCents * item.base / baseTotal));
    else cents = Math.floor(totalCents / bases.length);
    allocated += cents;
    shares.set(item.id,cents / 100);
  });

  return {
    paidShare:Number(shares.get(ticketId) ?? 0),
    orderTotal:Number(order.total || 0),
    orderSubtotal:Number(order.subtotal || 0),
    ticketCount:tickets.length,
  };
}
