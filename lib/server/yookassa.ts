import { randomUUID } from "crypto";

export async function createPayment(input: { amount: number; orderPublicId: string; description: string; returnUrl: string; customerEmail: string }) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("YooKassa is not configured");
  const auth = Buffer.from(`${shopId}:${secret}`).toString("base64");
  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Idempotence-Key": randomUUID(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { value: input.amount.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description.slice(0, 128),
      metadata: { orderPublicId: input.orderPublicId },
      receipt: { customer: { email: input.customerEmail }, items: [{ description: input.description.slice(0, 128), quantity: "1.00", amount: { value: input.amount.toFixed(2), currency: "RUB" }, vat_code: 1 }] },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.description || `YooKassa error ${response.status}`);
  return data as { id: string; confirmation?: { confirmation_url?: string } };
}

export async function getPayment(paymentId: string) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("YooKassa is not configured");
  const auth = Buffer.from(`${shopId}:${secret}`).toString("base64");
  const response = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.description || `YooKassa error ${response.status}`);
  return data as { id: string; status: string; paid: boolean; amount: { value: string; currency: string }; metadata?: { orderPublicId?: string } };
}
