'use client';

import { useEffect, useRef, useState } from 'react';

type ScanResult = {
  result: 'accepted' | 'already_used' | 'invalid' | 'not_found';
  ticket?: { public_id:string; event_slug:string; owner_name:string; category_name:string; status:string; used_at:string|null };
  error?: string;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
  }
}

function extractToken(raw: string) {
  const value = raw.trim();
  if (value.startsWith('AGAYO-TICKET:')) return value.slice('AGAYO-TICKET:'.length).trim();
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/tickets\/([^/]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {}
  return value;
}

export default function AdminScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [manual, setManual] = useState('');
  const [cameraState, setCameraState] = useState<'idle'|'starting'|'active'|'unsupported'|'blocked'>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(raw: string) {
    const token = extractToken(raw);
    if (token.length < 16 || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/tickets/scan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}) });
      const data = await response.json();
      setResult(response.ok || data.result ? data : { result:'not_found', error:data.error || 'Не удалось проверить билет' });
      if (navigator.vibrate) navigator.vibrate(data.result === 'accepted' ? 100 : [100,70,100]);
    } catch {
      setResult({ result:'not_found', error:'Нет соединения с сервером' });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    if (!window.BarcodeDetector) { setCameraState('unsupported'); return; }
    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraState('active');
      scanningRef.current = true;
      const detector = new window.BarcodeDetector({ formats:['qr_code'] });
      const loop = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            scanningRef.current = false;
            await submit(codes[0].rawValue);
            window.setTimeout(() => { scanningRef.current = true; void loop(); }, 1800);
            return;
          }
        } catch {}
        window.setTimeout(() => void loop(), 220);
      };
      void loop();
    } catch { setCameraState('blocked'); }
  }

  useEffect(() => () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const tone = result?.result === 'accepted' ? 'ok' : result ? 'bad' : '';
  return <main className="scanner-page">
    <header className="scanner-top"><a href="/admin">← Управление</a><span>AGAYO / КОНТРОЛЬ ВХОДА</span></header>
    <section className="scanner-shell">
      <div className="scanner-title"><span>QR SCANNER</span><h1>ВХОД</h1><p>Наведи камеру на QR билета. Один QR можно успешно погасить только один раз.</p></div>
      <div className="scanner-camera">
        <video ref={videoRef} muted playsInline />
        <div className="scanner-frame" aria-hidden="true"><i/><i/><i/><i/></div>
        {cameraState !== 'active' ? <div className="scanner-camera-cover"><b>{cameraState === 'blocked' ? 'КАМЕРА НЕДОСТУПНА' : cameraState === 'unsupported' ? 'СКАНЕР НЕ ПОДДЕРЖИВАЕТСЯ' : 'КАМЕРА ГОТОВА'}</b><p>{cameraState === 'blocked' ? 'Разреши доступ к камере в браузере или используй ручной ввод.' : cameraState === 'unsupported' ? 'Используй ручной ввод токена/ссылки ниже.' : 'Лучше использовать заднюю камеру телефона.'}</p>{cameraState === 'idle' ? <button type="button" onClick={() => void startCamera()}>Включить камеру</button> : null}</div> : null}
      </div>
      <form className="scanner-manual" onSubmit={(event) => { event.preventDefault(); void submit(manual); }}><label><span>РУЧНАЯ ПРОВЕРКА</span><input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="AGAYO-TICKET:… или ссылка на билет" /></label><button disabled={busy} type="submit">{busy ? 'ПРОВЕРЯЕМ…' : 'ПРОВЕРИТЬ'}</button></form>
      {result ? <div className={`scanner-result ${tone}`}><span>{result.result === 'accepted' ? 'ПРОХОД РАЗРЕШЁН' : result.result === 'already_used' ? 'УЖЕ ИСПОЛЬЗОВАН' : result.result === 'invalid' ? 'БИЛЕТ НЕДЕЙСТВИТЕЛЕН' : 'БИЛЕТ НЕ НАЙДЕН'}</span>{result.ticket ? <><h2>{result.ticket.owner_name}</h2><p>{result.ticket.category_name} · {result.ticket.public_id}</p><p>{result.ticket.event_slug}</p>{result.ticket.used_at && result.result === 'already_used' ? <b>Первый проход: {new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(new Date(result.ticket.used_at))}</b> : null}</> : <p>{result.error || 'Проверь QR и попробуй ещё раз.'}</p>}</div> : null}
    </section>
  </main>;
}
