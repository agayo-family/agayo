type SmsRuResponse = {
  status?: string;
  status_code?: number;
  status_text?: string;
  sms?: Record<string, { status?: string; status_code?: number; status_text?: string; sms_id?: string }>;
};

function smsRuPhone(phone: string) {
  return phone.replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
}

export function isSmsConfigured() {
  return Boolean(process.env.SMS_RU_API_ID);
}

async function sendSms(to: string, message: string, requestIp?: string | null) {
  const apiId = process.env.SMS_RU_API_ID;
  if (!apiId) throw new Error("SMS provider is not configured");

  const phone = smsRuPhone(to);
  if (!/^7\d{10}$/.test(phone)) throw new Error("Некорректный номер телефона");

  const body = new URLSearchParams({
    api_id: apiId,
    to: phone,
    msg: message,
    json: "1",
  });
  if (requestIp) body.set("ip", requestIp);
  if (process.env.SMS_RU_FROM) body.set("from", process.env.SMS_RU_FROM);
  if (process.env.SMS_RU_TEST === "1") body.set("test", "1");

  const response = await fetch("https://sms.ru/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`SMS.RU HTTP ${response.status}`);

  const data = (await response.json()) as SmsRuResponse;
  const entry = data.sms?.[phone];
  if (data.status !== "OK" || data.status_code !== 100 || !entry || entry.status !== "OK" || entry.status_code !== 100) {
    throw new Error(entry?.status_text || data.status_text || `SMS.RU error ${entry?.status_code ?? data.status_code ?? "unknown"}`);
  }
  return entry.sms_id || null;
}

export async function sendLoginCodeSms(to: string, code: string, requestIp?: string | null) {
  return sendSms(to, `AGAYO: код входа ${code}. Никому его не сообщай. Код действует 10 минут.`, requestIp);
}
