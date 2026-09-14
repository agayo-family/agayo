"use client";

import { MouseEvent, useState } from "react";
import { useFavorites } from "@/lib/client/favorites";

export default function FavoriteButton({ photoId }: { photoId: string }) {
  const { ids, toggle } = useFavorites();
  const [pending, setPending] = useState(false);
  const active = ids.has(photoId);

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    setPending(true);
    try { await toggle(photoId); } finally { setPending(false); }
  }

  return (
    <button
      className={`favorite-button ${active ? "is-active" : ""}`}
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}
    >
      {active ? "♥" : "♡"}
    </button>
  );
}
