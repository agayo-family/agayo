'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserCodeReader, BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

type ScanResult = {
  result: 'accepted' | 'already_used' | 'invalid' | 'not_found';
  ticket?: { public_id:string; event_slug:string; owner_name:string; category_name:string; status:string; used_at:string|null };
  error?: string;
};

type CameraState = 'idle' | 'starting' | 'active' | 'blocked' | 'unavailable';

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

function cameraErrorMessage(error: unknown) {
  if (!(error instanceof DOMException)) return 'Не удалось запустить камеру. Используй ручной ввод ниже.';
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Разреши доступ к камере в настройках браузера и попробуй снова.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'Камера не найдена. Можно проверить билет вручную.';
  if (error.name === 'NotReadableError') return 'Камера занята другим приложением. Закрой его и попробуй снова.';
  return 'Не удалось запустить камеру. Используй ручной ввод ниже.';
}

export default function AdminScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const submittingRef = useRef(false);
  const lastScanRef = useRef<{ value:string; at:number } | null>(null);
  const mountedRef = useRef(true);
  const [manual, setManual] = useState('');
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraMessage, setCameraMessage] = useState('Лучше использовать заднюю камеру телефона.');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(raw: string) {
    const token = extractToken(raw);
    if (token.length < 16 || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/tickets/scan', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token}),
      });
      const data = await response.json();
      if (!mountedRef.current) return;
      setResult(response.ok || data.result ? data : { result:'not_found', error:data.error || 'Не удалось проверить билет' });
      if (navigator.vibrate) navigator.vibrate(data.result === 'accepted' ? 100 : [100,70,100]);
    } catch {
      if (mountedRef.current) setResult({ result:'not_found', error:'Нет соединения с сервером' });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  async function stopCamera() {
    try { await controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    BrowserCodeReader.releaseAllStreams();
    if (mountedRef.current) setCameraState('idle');
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setCameraState('unavailable');
      setCameraMessage('Этот браузер не даёт сайту доступ к камере. Используй ручной ввод ниже.');
      return;
    }

    setCameraState('starting');
    setCameraMessage('Запрашиваем доступ к камере…');
    setResult(null);

    try {
      await stopCamera();
      if (!mountedRef.current || !videoRef.current) return;
      setCameraState('starting');

      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 800,
        tryPlayVideoTimeout: 6000,
      });

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (decoded) => {
          if (!decoded || submittingRef.current) return;
          const raw = decoded.getText().trim();
          if (!raw) return;

          const now = Date.now();
          const previous = lastScanRef.current;
          if (previous && previous.value === raw && now - previous.at < 2500) return;
          lastScanRef.current = { value: raw, at: now };
          void submit(raw);
        },
      );

      if (!mountedRef.current) {
        await controls.stop();
        return;
      }
      controlsRef.current = controls;
      setCameraState('active');
      setCameraMessage('Сканер активен. Наведи камеру на QR билета.');
    } catch (error) {
      BrowserCodeReader.releaseAllStreams();
      if (!mountedRef.current) return;
      setCameraState('blocked');
      setCameraMessage(cameraErrorMessage(error));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { void controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      BrowserCodeReader.releaseAllStreams();
    };
  }, []);

  const tone = result?.result === 'accepted' ? 'ok' : result ? 'bad' : '';
  const cameraTitle = cameraState === 'active'
    ? 'СКАНЕР АКТИВЕН'
    : cameraState === 'starting'
      ? 'ЗАПУСКАЕМ КАМЕРУ'
      : cameraState === 'blocked'
        ? 'КАМЕРА НЕДОСТУПНА'
        : cameraState === 'unavailable'
          ? 'КАМЕРА НЕ ПОДДЕРЖИВАЕТСЯ'
          : 'КАМЕРА ГОТОВА';

  return <main className="scanner-page">
    <header className="scanner-top"><a href="/admin">← Управление</a><span>AGAYO / КОНТРОЛЬ ВХОДА</span></header>
    <section className="scanner-shell">
      <div className="scanner-title"><span>QR SCANNER</span><h1>ВХОД</h1><p>Наведи камеру на QR билета. Один QR можно успешно погасить только один раз.</p></div>
      <div className="scanner-camera">
        <video ref={videoRef} muted playsInline autoPlay />
        <div className="scanner-frame" aria-hidden="true"><i/><i/><i/><i/></div>
        {cameraState !== 'active' ? <div className="scanner-camera-cover"><b>{cameraTitle}</b><p>{cameraMessage}</p>{cameraState !== 'starting' ? <button type="button" onClick={() => void startCamera()}>Включить камеру</button> : null}</div> : <div className="scanner-camera-live"><span>LIVE</span><button type="button" onClick={() => void stopCamera()}>Выключить</button></div>}
      </div>
      <form className="scanner-manual" onSubmit={(event) => { event.preventDefault(); void submit(manual); }}><label><span>РУЧНАЯ ПРОВЕРКА</span><input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="AGAYO-TICKET:… или ссылка на билет" /></label><button disabled={busy} type="submit">{busy ? 'ПРОВЕРЯЕМ…' : 'ПРОВЕРИТЬ'}</button></form>
      {result ? <div className={`scanner-result ${tone}`}><span>{result.result === 'accepted' ? 'ПРОХОД РАЗРЕШЁН' : result.result === 'already_used' ? 'УЖЕ ИСПОЛЬЗОВАН' : result.result === 'invalid' ? 'БИЛЕТ НЕДЕЙСТВИТЕЛЕН' : 'БИЛЕТ НЕ НАЙДЕН'}</span>{result.ticket ? <><h2>{result.ticket.owner_name}</h2><p>{result.ticket.category_name} · {result.ticket.public_id}</p><p>{result.ticket.event_slug}</p>{result.ticket.used_at && result.result === 'already_used' ? <b>Первый проход: {new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(new Date(result.ticket.used_at))}</b> : null}</> : <p>{result.error || 'Проверь QR и попробуй ещё раз.'}</p>}</div> : null}
    </section>
  </main>;
}
