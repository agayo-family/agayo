"use client";

import { MouseEvent, useEffect, useState } from "react";

const STORAGE_KEY = "agayo:favorites";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function FavoriteButton({ photoId }: { photoId: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(readFavorites().includes(photoId));
  }, [photoId]);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const favorites = new Set(readFavorites());
    if (favorites.has(photoId)) favorites.delete(photoId);
    else favorites.add(photoId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
    setActive(favorites.has(photoId));
    window.dispatchEvent(new Event("agayo:favorites-change"));
  }

  return (
    <button className={`favorite-button ${active ? "is-active" : ""}`} type="button" onClick={toggle} aria-pressed={active} aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}>
      {active ? "♥" : "♡"}
    </button>
  );
}
