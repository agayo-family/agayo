'use client';
import { useEffect } from 'react';
import { unlockHalloweenSound } from '@/lib/client/halloween-sound';
export default function HalloweenSoundGate() {
  useEffect(() => {
    const unlock = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-halloween-sound="true"]')) return;
      unlockHalloweenSound();
      try { sessionStorage.setItem('agayo-halloween-sound-v1', 'on'); } catch {}
    };
    document.addEventListener('click', unlock, true);
    return () => document.removeEventListener('click', unlock, true);
  }, []);
  return null;
}
