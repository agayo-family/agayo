import { NextResponse } from "next/server";
import { syncYooKassaPayment } from "@/lib/server/payment-processing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const notification = await request.json();
    const paymentId = String(notification?.object?.id || "").trim();
    if (!paymentId) return NextResponse.json({ ok: true });

    // We do not trust the webhook body as the source of truth. The shared
    // processor requests the payment directly from YooKassa before changing
    // an AGAYO order.
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    await syncYooKassaPayment(paymentId, base);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("YooKassa webhook:", error);
    // A non-2xx response asks YooKassa to retry the notification. Processing is
    // idempotent: paid orders do not create tickets twice, and sent deliveries
    // are skipped on retry.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
