const YOOKASSA_API = "https://api.yookassa.ru/v3";

export class YooKassaApiError extends Error {
  status: number | null;
  retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "YooKassaApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type?: string; confirmation_url?: string };
  metadata?: { orderPublicId?: string };
  cancellation_details?: { party?: string; reason?: string };
};

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("YooKassa is not configured");
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestYooKassa(url: string, init: RequestInit, attempts = 1) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      const data = await readJson(response);
      if (response.ok) return data;

      const retryable = response.status === 429 || response.status >= 500;
      const message = data?.description || data?.code || `YooKassa error ${response.status}`;
      const error = new YooKassaApiError(message, response.status, retryable);
      lastError = error;

      if (!retryable || attempt === attempts - 1) throw error;
    } catch (error) {
      if (error instanceof YooKassaApiError && !error.retryable) throw error;
      lastError = error;
      if (attempt === attempts - 1) {
        if (error instanceof YooKassaApiError) throw error;
        throw new YooKassaApiError(error instanceof Error ? error.message : "YooKassa network error", null, true);
      }
    }

    await wait([250, 700, 1500, 2500][attempt] ?? 2500);
  }

  throw lastError instanceof Error ? lastError : new Error("YooKassa request failed");
}

export async function createPayment(input: {
  amount: number;
  orderPublicId: string;
  description: string;
  returnUrl: string;
  customerEmail: string;
}) {
  if (process.env.PAYMENTS_ENABLED !== "1") throw new Error("Платежи временно отключены владельцем сайта");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Сумма платежа должна быть больше 0 ₽");

  const vatCode = Number(process.env.YOOKASSA_VAT_CODE);
  const paymentMode = String(process.env.YOOKASSA_PAYMENT_MODE || "").trim();
  const paymentSubject = String(process.env.YOOKASSA_PAYMENT_SUBJECT || "").trim();
  const receiptReady = Number.isInteger(vatCode) && vatCode >= 1 && vatCode <= 12 && Boolean(paymentMode) && Boolean(paymentSubject);
  const receiptRequired = process.env.YOOKASSA_RECEIPT_REQUIRED === "1";

  if (receiptRequired && !receiptReady) {
    throw new Error("Фискальный чек включён, но параметры YooKassa для чека заполнены не полностью");
  }

  const receipt = receiptReady
    ? {
        customer: { email: input.customerEmail },
        items: [
          {
            description: input.description.slice(0, 128),
            quantity: "1.00",
            amount: { value: input.amount.toFixed(2), currency: "RUB" },
            vat_code: vatCode,
            payment_mode: paymentMode,
            payment_subject: paymentSubject,
          },
        ],
        internet: true,
      }
    : undefined;

  // One AGAYO order = one stable idempotence key. YooKassa keeps POST
  // idempotence for 24 hours, so retries of this exact request cannot create
  // a second payment for the same order.
  const data = await requestYooKassa(
    `${YOOKASSA_API}/payments`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Idempotence-Key": input.orderPublicId.slice(0, 64),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { value: input.amount.toFixed(2), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: input.returnUrl },
        description: input.description.slice(0, 128),
        metadata: { orderPublicId: input.orderPublicId },
        ...(receipt ? { receipt } : {}),
      }),
    },
    4,
  );

  return data as YooKassaPayment;
}

export async function getPayment(paymentId: string) {
  const data = await requestYooKassa(
    `${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    },
    2,
  );

  return data as YooKassaPayment;
}
