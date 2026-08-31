"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "agayo:favorites";

function countFavorites() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

export default function FavoriteSummary() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(countFavorites());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("agayo:favorites-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("agayo:favorites-change", sync);
    };
  }, []);
  return <strong>{count || "♡"}</strong>;
}
