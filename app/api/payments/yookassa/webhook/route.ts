import { NextResponse } from "next/server";
import { syncYooKassaPayment, syncYooKassaRefund } from "@/lib/server/payment-processing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const notification = await request.json();
    const event = String(notification?.event || "").trim();
    const objectId = String(notification?.object?.id || "").trim();
    if (!objectId) return NextResponse.json({ ok: true });

    if (event === "refund.succeeded") {
      await syncYooKassaRefund(objectId);
      return NextResponse.json({ ok: true });
    }

    if (event !== "payment.succeeded" && event !== "payment.canceled" && event !== "payment.waiting_for_capture") {
      return NextResponse.json({ ok: true });
    }

    // Webhook payload is only a trigger. The authoritative payment state is
    // fetched directly from YooKassa before any AGAYO order is changed.
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    await syncYooKassaPayment(objectId, base);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("YooKassa webhook:", error);
    // Non-2xx asks YooKassa to retry. All processors above are idempotent.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
