export type DeliveryStatus = { total: number; sent: number; failed: number };

export function needsOrderStatusRefresh(order: { status: string; ticketCount: number; delivery: DeliveryStatus }) {
  return order.status === 'pending' || (order.status === 'paid'
    && (order.ticketCount === 0 || order.delivery.sent < order.ticketCount));
}
