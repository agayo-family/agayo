import QRCode from "qrcode";
import { isHalloweenEvent } from '@/lib/event-presentation';
import { CIRCUS_ART, CLOWN_ART, BAT_ART } from '@/lib/halloween-art';
import { deliverTicketTelegram } from './telegram';
import { sendProviderEmail } from './email-transport';

type EmailAttachment = {
  filename: string;
  content: string;
  content_type?: string;
  content_id?: string;
};

export type TicketEmailInput = {
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
  eventSlug?:string;
  personalTitle?:string;
  personalDescription?:string;
  deliveryKey?:string;
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
  const lines:string[]=[]; let current=''; let truncated=false;
  for (let index=0;index<words.length;index++) {
    const word=words[index];
    if (current && `${current} ${word}`.length>maxChars) {
      lines.push(current); current='';
      if (lines.length===maxLines) { truncated=true; break; }
    }
    if (word.length>maxChars) { current=word.slice(0,maxChars-1)+'…'; truncated=true; }
    else current=current?`${current} ${word}`:word;
  }
  if (current && lines.length<maxLines) lines.push(current);
  if (truncated && lines.length && !lines[lines.length-1].endsWith('…')) lines[lines.length-1]=lines[lines.length-1].slice(0,maxChars-1)+'…';
  return lines;
}

async function sendEmail(to: string, subject: string, html: string, attachments:EmailAttachment[] = [], idempotencyKey?:string) {
  return sendProviderEmail({ to: [to.trim().toLowerCase()], subject, html, ...(attachments.length ? {attachments} : {}) }, idempotencyKey);
}

export async function sendLoginCode(to: string, code: string) {
  return sendEmail(to, "Код входа в AGAYO", `<div style="font-family:Arial;background:#0b0b0c;color:#f2f0ea;padding:28px"><p>AGAYO ID</p><h1 style="font-size:36px">${escapeHtml(code)}</h1><p>Код действует 10 минут. Если ты не запрашивал вход — просто проигнорируй письмо.</p></div>`);
}

export function ticketSvg(input:TicketEmailInput, qrBase64:string) {
  const primary=safeHex(input.theme?.primary,"#0B0B0C");
  const secondary=safeHex(input.theme?.secondary,"#4B0F19");
  const accent=safeHex(input.theme?.accent,"#C21F39");
  const lines=(value:string,x:number,y:number,size:number,max:number,count=2)=>wrapSvgText(value,max,count).map((line,index)=>`<text x="${x}" y="${y+index*(size+8)}" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="${size}">${escapeXml(line)}</text>`).join('');
  const halloween=isHalloweenEvent({slug:input.eventSlug||'',title:input.eventTitle});
  const art=halloween ? `<svg x="0" y="980" width="370" height="290" viewBox="200 0 800 650" opacity=".6">${CIRCUS_ART}<g transform="translate(780 370) scale(.75)">${CLOWN_ART}</g><g transform="translate(280 120) scale(.7)" fill="${accent}">${BAT_ART}</g></svg>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs><linearGradient id="bg"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs>
  <rect width="1200" height="1600" fill="url(#bg)"/><rect x="60" y="60" width="1080" height="1480" rx="24" fill="none" stroke="#F2F0EA" stroke-opacity=".3"/>
  <text x="100" y="135" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="24" letter-spacing="5">AGAYO / ${input.personalTitle?'PERSONAL TICKET':'DIGITAL TICKET'}</text>
  ${lines(input.eventTitle,100,235,62,26)}
  ${lines(`${input.eventDate} · ${input.eventTime} · ${input.eventCity} · ${input.eventAge}${input.alcoholFree?' · ALCOHOL FREE':''}`,100,380,24,68)}
  <text x="100" y="465" fill="#D7B8C6" font-family="Arial,sans-serif" font-size="19" letter-spacing="3">ВЛАДЕЛЕЦ</text>
  ${lines(input.ownerName,100,515,34,46)}
  <text x="100" y="610" fill="#D7B8C6" font-family="Arial,sans-serif" font-size="19" letter-spacing="3">${input.personalTitle?'ПЕРСОНАЛЬНО ДЛЯ ТЕБЯ':'КАТЕГОРИЯ'}</text>
  ${lines(input.personalTitle||input.categoryName,100,658,32,46)}
  ${input.personalDescription?lines(input.personalDescription,100,750,21,86):''}
  ${input.zone||input.seat?lines([input.zone,input.seat].filter(Boolean).join(' · '),100,820,20,86):''}
  ${art}
  <rect x="375" y="875" width="450" height="450" rx="18" fill="#F2F0EA"/><image x="397" y="897" width="406" height="406" href="data:image/png;base64,${qrBase64}"/>
  <text x="100" y="1410" fill="#F2F0EA" font-family="Arial,sans-serif" font-size="30">${escapeXml(input.ticketId)}</text>
  <text x="100" y="1475" fill="#D9C9D0" font-family="Arial,sans-serif" font-size="23">ОДИН БИЛЕТ = ОДИН ВХОД · Покажи QR на входе</text>
</svg>`;
}

export async function sendTicketEmail(to: string, input:TicketEmailInput) {
  const qrBuffer = await QRCode.toBuffer(`AGAYO-TICKET:${input.qrToken}`, {
    type:"png",margin:1,width:560,errorCorrectionLevel:"M",
    color:{dark:"#0B0B0C",light:"#F2F0EA"},
  });
  const qrBase64=qrBuffer.toString("base64");
  const telegram = await deliverTicketTelegram(to, {
    ticketId: input.ticketId, ticketUrl: input.ticketUrl, deliveryKey: input.deliveryKey, qrBuffer,
    caption: [input.eventTitle, `${input.eventDate} · ${input.eventTime} · ${input.eventCity}`, `${input.eventAge}${input.alcoholFree ? ' · ALCOHOL FREE' : ''}`, `Владелец: ${input.ownerName}`, `Категория: ${input.categoryName}`, `Билет: ${input.ticketId}`, 'Один билет = один вход. QR находится в приложенном файле.', input.personalTitle, input.personalDescription, [input.zone, input.seat].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
  });
  if (telegram.handled) return { channel: 'telegram' as const };
  const svg=ticketSvg(input,qrBase64);
  const primary=safeHex(input.theme?.primary,"#0B0B0C");
  const secondary=safeHex(input.theme?.secondary,"#4B0F19");
  const accent=safeHex(input.theme?.accent,"#C21F39");
  const halloween=isHalloweenEvent({slug:input.eventSlug||'',title:input.eventTitle});
  const atmosphere=halloween ? `<img src="${escapeHtml(new URL('/halloween-ticket-atmosphere.png',input.ticketUrl).href)}" alt="Цирк, кровавая луна, клоун и летучие мыши" width="420" style="display:block;width:100%;max-width:420px;height:auto;margin:20px auto;opacity:.8">` : '';
  const personal=input.personalTitle ? `<div style="margin:20px 0;padding:16px;border-left:3px solid ${accent};background:#0b0b0c70"><strong>${escapeHtml(input.personalTitle)}</strong><p style="line-height:1.6">${escapeHtml(input.personalDescription)}</p></div>` : '';
  const poster=input.posterUrl ? `<img src="${escapeHtml(input.posterUrl)}" alt="" style="display:block;width:100%;height:220px;object-fit:cover;opacity:.7">` : "";
  const html=`<div style="margin:0;background:#0B0B0C;padding:24px;font-family:Arial,sans-serif;color:#F2F0EA">
    <div style="max-width:680px;margin:0 auto;border:1px solid #35353A;background:linear-gradient(145deg,${primary},${secondary} 68%,#0B0B0C);overflow:hidden">
      ${poster}
      <div style="padding:28px">
        <div style="font-size:11px;letter-spacing:.16em;color:#C8C0B8">AGAYO / DIGITAL TICKET</div>
        <h1 style="margin:16px 0 8px;font-size:42px;line-height:.95;color:#F2F0EA">${escapeHtml(input.eventTitle)}</h1>
        <p style="margin:0;color:#D6D0C8;font-size:13px">${escapeHtml(input.eventDate)} · ${escapeHtml(input.eventTime)} · ${escapeHtml(input.eventCity)} · ${escapeHtml(input.eventAge)}${input.alcoholFree?" · ALCOHOL FREE":""}</p>
        ${personal}
        <div style="display:block;margin:26px 0;padding:20px;border:1px solid rgba(255,255,255,.15);background:rgba(11,11,12,.55)">
          <p style="margin:0 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">ВЛАДЕЛЕЦ</p><strong style="font-size:22px">${escapeHtml(input.ownerName)}</strong>
          <p style="margin:18px 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">КАТЕГОРИЯ</p><strong style="font-size:22px">${escapeHtml(input.categoryName)}</strong>
          <p style="margin:18px 0 4px;color:#8E8E91;font-size:10px;letter-spacing:.12em">ID</p><strong style="font-size:18px">${escapeHtml(input.ticketId)}</strong>
        </div>
        <div style="text-align:center;margin:24px 0"><img src="cid:agayo-ticket-qr" alt="QR билета" width="300" height="300" style="display:inline-block;width:300px;max-width:100%;height:auto;background:#F2F0EA;padding:12px"><p style="font-size:11px;letter-spacing:.12em;color:#D6D0C8">ОДИН БИЛЕТ = ОДИН ВХОД</p></div>
        ${atmosphere}
        <p style="margin:22px 0 0;font-size:12px;color:#CFC7BF">Билет уже находится прямо в этом письме. В приложении к письму также есть файл билета. Ссылка ниже — только запасной способ открыть актуальный статус.</p>
        <p style="margin:18px 0 0"><a href="${escapeHtml(input.ticketUrl)}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;padding:13px 16px;font-weight:700">Открыть актуальный билет →</a></p>
      </div>
    </div>
  </div>`;

  return sendEmail(to, `Твой билет · ${input.eventTitle}`, html, [
    { filename:`AGAYO-${input.ticketId}-QR.png`,content:qrBase64,content_type:"image/png",content_id:"agayo-ticket-qr" },
    { filename:`AGAYO-${input.ticketId}.svg`,content:Buffer.from(svg,"utf8").toString("base64"),content_type:"image/svg+xml" },
  ], input.deliveryKey);
}
export async function sendNpdReceiptEmail(to:string,input:{orderPublicId:string;amount:number;receiptId?:string|null;receiptUrl?:string|null}) {
  const link=input.receiptUrl ? `<p style="margin:20px 0 0"><a href="${escapeHtml(input.receiptUrl)}" style="display:inline-block;background:#6B1F2B;color:#F2F0EA;text-decoration:none;padding:12px 15px;font-weight:700">Открыть чек →</a></p>` : "";
  const id=input.receiptId ? `<p style="margin:12px 0 0;color:#D5CEC7">Номер чека: <strong>${escapeHtml(input.receiptId)}</strong></p>` : "";
  return sendEmail(to,`Чек · заказ ${input.orderPublicId}`,`<div style="font-family:Arial,sans-serif;background:#0B0B0C;color:#F2F0EA;padding:28px"><div style="max-width:620px;margin:auto;border:1px solid #343438;padding:26px;background:#151517"><p style="font-size:11px;letter-spacing:.13em;color:#8E8E91">AGAYO / ЧЕК НПД</p><h1 style="font-size:34px;margin:14px 0">${escapeHtml(input.amount.toFixed(2))} ₽</h1><p>Чек по заказу <strong>${escapeHtml(input.orderPublicId)}</strong> сформирован организатором.</p>${id}${link}</div></div>`);
}

