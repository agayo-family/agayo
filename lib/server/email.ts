const endpoint = "https://api.resend.com/emails";

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email provider is not configured");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Email provider error: ${response.status}`);
}

export async function sendLoginCode(to: string, code: string) {
  return sendEmail(to, "Код входа в AGAYO", `<div style="font-family:Arial;background:#0b0b0c;color:#f2f0ea;padding:28px"><p>AGAYO ID</p><h1 style="font-size:36px">${code}</h1><p>Код действует 10 минут. Если ты не запрашивал вход — просто проигнорируй письмо.</p></div>`);
}

export async function sendTicketEmail(to: string, eventTitle: string, ticketId: string, ticketUrl: string) {
  return sendEmail(to, `Твой билет · ${eventTitle}`, `<div style="font-family:Arial;background:#0b0b0c;color:#f2f0ea;padding:28px"><p>AGAYO / DIGITAL TICKET</p><h1>${eventTitle}</h1><p>Билет ${ticketId} готов. Он также сохранён в твоём AGAYO ID.</p><p><a style="color:#f2f0ea" href="${ticketUrl}">Открыть билет →</a></p></div>`);
}
