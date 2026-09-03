import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizePhone = (value: string) => value.replace(/[^+\d]/g, "");
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const publicId = (prefix: string) => `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;

export function signSession(raw: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(raw).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
