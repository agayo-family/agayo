"use client";

import { useRef, useState } from "react";

export default function VoiceReview({ audioSrc, text, author }: { audioSrc?: string; text: string; author: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const available = Boolean(audioSrc);

  async function toggle() {
    if (!available || !audioRef.current) return;
    if (audioRef.current.paused) {
      await audioRef.current.play();
      setPlaying(true);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="voice-card">
      <button className="voice-play" type="button" onClick={toggle} disabled={!available} aria-label={available ? (playing ? "Остановить отзыв" : "Воспроизвести отзыв") : "Аудио пока не загружено"}>
        {playing ? "Ⅱ" : "▶"}
      </button>
      <div className="voice-content">
        <div className="voice-wave" aria-hidden="true">▁▂▃▄▆▇▆▄▅▇▆▄▂▃▅▆▇▅▄▂</div>
        <p>«{text}»</p>
        <span>{author}{!available ? " · аудио будет добавлено организатором" : ""}</span>
      </div>
      {audioSrc ? <audio ref={audioRef} src={audioSrc} onEnded={() => setPlaying(false)} preload="none" /> : null}
    </div>
  );
}
