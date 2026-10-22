import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import {loadTs,loadTsx} from './load-ts.mjs';
const transport = await loadTsx('../lib/server/email-transport.ts');
const presentation=await loadTs('../lib/event-presentation.ts'),art=await loadTs('../lib/halloween-art.ts');
const {ticketSvg,sendTicketEmail}=await loadTsx('../lib/server/email.ts',{'@/lib/event-presentation':presentation,'@/lib/halloween-art':art,'./email-transport':transport,'./telegram':{deliverTicketTelegram:async()=>({handled:false})}});
const input={eventTitle:'AGAYO HALLOWEEN: ПОСЛЕДНЯЯ УЛЫБКА',eventSlug:'agayo-halloween-история-одного-клоуна',eventDate:'07.11.26',eventTime:'18:00–21:00',eventCity:'Йошкар-Ола',eventAge:'14+',alcoholFree:true,ticketId:'AGY-PERSONAL-FIXTURE',ticketUrl:'https://www.agayo.ru/tickets/isolated-test-token',qrToken:'isolated-test-token',ownerName:'Сергей <script>alert(1)</script>',categoryName:'GOLD',personalTitle:'Для тебя',personalDescription:'Все слова в коротком описании сохраняются полностью.',theme:{primary:'#101018',secondary:'#7f1430',accent:'#cb385f'},deliveryKey:'ISOLATED-TEST-ONLY'};
test('Halloween SVG uses event colors, escapes text and its unobstructed QR decodes after rasterization',async()=>{
  const png=await QRCode.toBuffer(`AGAYO-TICKET:${input.qrToken}`,{width:560,margin:1});
  const svg=ticketSvg(input,png.toString('base64'));
  assert.ok(svg.includes('#7f1430') && svg.includes('Все слова в коротком описании сохраняются полностью.'));
  assert.equal(svg.includes('<script>'),false);assert.ok(svg.includes('&lt;script&gt;'));
  const {data,info}=await sharp(Buffer.from(svg)).extract({left:375,top:875,width:450,height:450}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
  const bitmap=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height)));
  assert.equal(new MultiFormatReader().decode(bitmap,new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.QR_CODE]]])).getText(),`AGAYO-TICKET:${input.qrToken}`);
});
test('email contains personal description, palette, Halloween atmosphere and attachments without sending real mail',async()=>{
  const previous=globalThis.fetch,key=process.env.EMAIL_PROVIDER_API_KEY,from=process.env.EMAIL_FROM;
  process.env.EMAIL_PROVIDER_API_KEY='isolated-do-not-send';process.env.EMAIL_FROM='fixture@example.test';
  let payload;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],input.deliveryKey);payload=JSON.parse(options.body);return Response.json({id:'isolated-email-id'});};
  try {
    await sendTicketEmail('guest@example.test',input);
    assert.ok(payload.html.includes(input.personalDescription));assert.ok(payload.html.includes('halloween-ticket-atmosphere.png'));
    assert.ok(payload.html.includes('#7f1430'));assert.equal(payload.attachments.length,2);
    assert.ok(payload.attachments.some(attachment=>attachment.filename.endsWith('.svg')));
  }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.EMAIL_PROVIDER_API_KEY;else process.env.EMAIL_PROVIDER_API_KEY=key;if(from===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=from;}
});
