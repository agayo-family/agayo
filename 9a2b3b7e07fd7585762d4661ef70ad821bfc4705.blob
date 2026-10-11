let audio: AudioContext | null = null;
export function unlockHalloweenSound() {
  try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { /* Visual effects also work without audio. */ }
}
export function playHalloweenSound(monster = false) {
  if (!audio || audio.state !== 'running') return;
  const time = audio.currentTime;
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 1300;
  gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.07, time + .035); gain.gain.exponentialRampToValueAtTime(.001, time + .6);
  filter.connect(gain); gain.connect(audio.destination);
  const oscillator = audio.createOscillator(); oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(monster ? 170 : 280, time); oscillator.frequency.exponentialRampToValueAtTime(48, time + .55);
  oscillator.connect(filter); oscillator.start(time); oscillator.stop(time + .65);
  oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
}
