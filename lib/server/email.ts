import QRCode from "qrcode";

const endpoint = "https://api.resend.com/emails";

type EmailAttachment = {
  filename: string;
  content: string;
  content_type?: string;
  content_id?: string;
};

type TicketEmailInput = {
  eventTitle:string;
  eventDate:string;
  eventTime:string;
  eventCity:string;
  eventAge:string;
  alcoholFree:boolean;
  ticketId:string;
  ticketUrl:string;
  qrToken:string;
  ownerName:string;
  categoryName:string;
  zone?:string|null;
  seat?:string|null;
  posterUrl?:string;
  theme?:{primary:string;secondary:string;accent:string};
};

function escapeHtml(value:unknown) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeXml(value:unknown) {
  return escapeHtml(value);
}

function safeHex(value:unknown,fallback:string) {
  const raw=String(value||"").trim();
  return /^#[0-9a-f]{6}$/i.test(raw)?raw:fallback;
}

function wrapSvgText(value:string,maxChars=23,maxLines=2) {
  const words=String(value||'').trim().split(/\s+/).filter(Boolean);
  const lines:string[]=[]; let current='';
  for(const word of words){
    if(!current){current=word;continue;}
    if(`${current} ${word}`.length<=maxChars) current=`${current} ${word}`;
    else { lines.push(current); current=word; if(lines.length>=maxLines-1) break; }
  }
  if(current && lines.length<maxLines) lines.push(current);
  const consumed=lines.join(' ').length;
  if(consumed < String(value||'').trim().length && lines.length) lines[lines.length-1]=`${lines[lines.length-1].slice(0,Math.max(1,maxChars-1))}…`;
  return lines;
}

async function sendEmail(to: string, subject: string, html: string, attachments:EmailAttachment[] = []) {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email provider is not configured");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, ...(attachments.length ? {attachments} : {}) }),
  });
  if (!response.ok) {
    let details="";
    try { details=JSON.stringify(await response.json()); } catch {}
    throw new Error(`Email provider error: ${response.status}${details?` · ${details.slice(0,300)}`:""}`);
  }
}

export async function sendLoginCode(to: string, code: string) {
  return sendEmail(to, "Код входа в AGAYO", `<div style="font-family:Arial;background:#0b0b0c;color:#f2f0ea;padding:28px"><p>AGAYO ID</p><h1 style="font-size:36px">${escapeHtml(code)}</h1><p>Код действует 10 минут. Если ты не запрашивал вход — просто проигнорируй письмо.</p></div>`);
}

function ticketSvg(input:TicketEmailInput, qrBase64:string) {
  const primary=safeHex(input.theme?.primary,"#0B0B0C");
  const secondary=safeHex(input.theme?.secondary,"#4B0F19");
  const accent=safeHex(input.theme?.accent,"#C21F39");
  const owner=escapeXml(input.ownerName);
  const category=escapeXml(input.categoryName);
  const titleLines=wrapSvgText(input.eventTitle).map(escapeXml);
  const ticketId=escapeXml(input.ticketId);
  const meta=escapeXml(`${input.eventDate} · ${input.eventTime} · ${input.eventCity} · ${input.eventAge}${input.alcoholFree?" · ALCOHOL FREE":""}`);
  const place=escapeXml([input.zone?`ЗОНА ${input.zone}`:"",input.seat?`МЕСТО ${input.seat}`:""].filter(Boolean).join(" · "));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset=".62" stop-color="${secondary}"/><stop offset="1" stop-color="#0B0B0C"/></linearGradient><radialGradient id="glow" cx="80%" cy="15%" r="70%"><stop stop-color="${accent}" stop-opacity=".48"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="1600" fill="url(#bg)"/><rect width="1200" height="1600" fill="url(#glow)"/>
  <rect x="60" y="60" width="1080" height="1480" rx="28" fill="none" stroke="#F2F0EA" stroke-opacity=".34" stroke-width="2"/>
  <text x="100" y="130" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="28" letter-spacing="7">AGAYO / DIGITAL TICKET</text>
  <text x="100" y="235" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="68" font-weight="700">${titleLines.map((line,index)=>`<tspan x="100" dy="${index===0?0:74}">${line}</tspan>`).join("")}</text>
  <text x="100" y="${345 + Math.max(0,titleLines.length-1)*74}" fill="#D7D1CA" font-family="Arial,sans-serif" font-size="26" letter-spacing="3">${meta}</text>
  <text x="100" y="485" fill="#8E8E91" font-family="Arial,sans-serif" font-size="22" letter-spacing="4">ВЛАДЕЛЕЦ</text>
  <text x="100" y="540" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="48" font-weight="700">${owner}</text>
  <text x="100" y="600" fill="#8E8E91" font-family="Arial,sans-serif" font-size="22" letter-spacing="4">КАТЕГОРИЯ</text>
  <text x="100" y="660" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="44" font-weight="700">${category}</text>
  ${place?`<text x="100" y="720" fill="#CFC7BF" font-family="Arial,sans-serif" font-size="25">${place}</text>`:""}
  <rect x="735" y="430" width="365" height="365" rx="18" fill="#F2F0EA"/>
  <image x="757" y="452" width="321" height="321" href="data:image/png;base64,${qrBase64}"/>
  <text x="100" y="1185" fill="#8E8E91" font-family="Arial,sans-serif" font-size="22" letter-spacing="4">БИЛЕТ</text>
  <text x="100" y="1250" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="52" font-weight="700">${ticketId}</text>
  <line x1="100" y1="1335" x2="1100" y2="1335" stroke="#F2F0EA" stroke-opacity=".18"/>
  <text x="100" y="1410" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="25">Покажи QR контролёру на входе</text>
  <text x="100" y="1470" fill="#8E8E91" font-family="Arial,sans-serif" font-size="20" letter-spacing="2">ОДИН БИЛЕТ = ОДИН ВХОД</text>
</svg>`;
}

export async function sendTicketEmail(to: string, input:TicketEmailInput) {
  const qrBuffer = await QRCode.toBuffer(`AGAYO-TICKET:${input.qrToken}`, {
    type:"png",margin:1,width:560,errorCorrectionLevel:"M",
    color:{dark:"#0B0B0C",light:"#F2F0EA"},
  });
  const qrBase64=qrBuffer.toString("base64");
  const svg=ticketSvg(input,qrBase64);
  const primary=safeHex(input.theme?.primary,"#0B0B0C");
  const secondary=safeHex(input.theme?.secondary,"#4B0F19");
  const accent=safeHex(input.theme?.accent,"#C21F39");
  const poster=input.posterUrl ? `<img src="${escapeHtml(input.posterUrl)}" alt="" style="display:block;width:100%;height:220px;object-fit:cover;opacity:.7">` : "";
  const html=`<div style="margin:0;background:#0B0B0C;padding:24px;font-family:Arial,sans-serif;color:#F2F0EA">
    <div style="max-width:680px;margin:0 auto;border:1px solid #35353A;background:linear-gradient(145deg,${primary},${secondary} 68%,#0B0B0C);overflow:hidden">
      ${poster}
      <div style="padding:28px">
        <div style="font-size:11px;letter-spacing:.16em;color:#C8C0B8">AGAYO / DIGITAL TICKET</div>
        <h1 style="margin:16px 0 8px;font-size:42px;line-height:.95;color:#F2F0EA">${escapeHtml(input.eventTitle)}</h1>
        <p style="margin:0;color:#D6D0C8;font-size:13px">${escapeHtml(input.eventDate)} · ${escapeHtml(input.eventTime)} · ${escapeHtml(input.eventCity)} · ${escapeHtml(input.eventAge)}${input.alcoholFree?" · ALCOHOL FREE":""}</p>
        <div style="display:block;margin:26px 0;padding:20px;border:1px solid rgba(255,255,255,.15);background:rgba(11,11,12,.55)">
          <p style="margin:0 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">ВЛАДЕЛЕЦ</p><strong style="font-size:22px">${escapeHtml(input.ownerName)}</strong>
          <p style="margin:18px 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">КАТЕГОРИЯ</p><strong style="font-size:22px">${escapeHtml(input.categoryName)}</strong>
          <p style="margin:18px 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">ID</p><strong style="font-size:18px">${escapeHtml(input.ticketId)}</strong>
        </div>
        <div style="text-align:center;margin:24px 0"><img src="cid:agayo-ticket-qr" alt="QR билета" width="300" height="300" style="display:inline-block;width:300px;max-width:100%;height:auto;background:#F2F0EA;padding:12px"><p style="font-size:11px;letter-spacing:.12em;color:#D6D0C8">ОДИН БИЛЕТ = ОДИН ВХОД</p></div>
        <p style="margin:22px 0 0;font-size:12px;color:#CFC7BF">Билет уже находится прямо в этом письме. В приложении к письму также есть файл билета. Ссылка ниже — только запасной способ открыть актуальный статус.</p>
        <p style="margin:18px 0 0"><a href="${escapeHtml(input.ticketUrl)}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;padding:13px 16px;font-weight:700">Открыть актуальный билет →</a></p>
      </div>
    </div>
  </div>`;

  return sendEmail(to, `Твой билет · ${input.eventTitle}`, html, [
    { filename:`AGAYO-${input.ticketId}-QR.png`,content:qrBase64,content_type:"image/png",content_id:"agayo-ticket-qr" },
    { filename:`AGAYO-${input.ticketId}.svg`,content:Buffer.from(svg,"utf8").toString("base64"),content_type:"image/svg+xml" },
  ]);
}
export async function sendNpdReceiptEmail(to:string,input:{orderPublicId:string;amount:number;receiptId?:string|null;receiptUrl?:string|null}) {
  const link=input.receiptUrl ? `<p style="margin:20px 0 0"><a href="${escapeHtml(input.receiptUrl)}" style="display:inline-block;background:#6B1F2B;color:#F2F0EA;text-decoration:none;padding:12px 15px;font-weight:700">Открыть чек →</a></p>` : "";
  const id=input.receiptId ? `<p style="margin:12px 0 0;color:#D5CEC7">Номер чека: <strong>${escapeHtml(input.receiptId)}</strong></p>` : "";
  return sendEmail(to,`Чек · заказ ${input.orderPublicId}`,`<div style="font-family:Arial,sans-serif;background:#0B0B0C;color:#F2F0EA;padding:28px"><div style="max-width:620px;margin:auto;border:1px solid #343438;padding:26px;background:#151517"><p style="font-size:11px;letter-spacing:.13em;color:#8E8E91">AGAYO / ЧЕК НПД</p><h1 style="font-size:34px;margin:14px 0">${escapeHtml(input.amount.toFixed(2))} ₽</h1><p>Чек по заказу <strong>${escapeHtml(input.orderPublicId)}</strong> сформирован организатором.</p>${id}${link}</div></div>`);
}

