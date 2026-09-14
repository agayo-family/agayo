"use client";

import { useFavorites } from "@/lib/client/favorites";

export default function FavoriteSummary() {
  const { loaded, ids } = useFavorites();
  if (!loaded) return <strong>…</strong>;
  return <strong>{ids.size || "♡"}</strong>;
}
