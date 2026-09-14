"use client";

import { useCallback, useEffect, useState } from "react";
import type { GalleryPhoto } from "@/lib/photos";

type FavoritesState = {
  loaded: boolean;
  authenticated: boolean;
  ids: Set<string>;
  photos: GalleryPhoto[];
};

let state: FavoritesState = { loaded: false, authenticated: false, ids: new Set(), photos: [] };
let loadPromise: Promise<void> | null = null;
const listeners = new Set<(next: FavoritesState) => void>();

function publish(next: FavoritesState) {
  state = next;
  for (const listener of listeners) listener(state);
}

async function loadFavorites(force = false) {
  if (state.loaded && !force) return;
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    try {
      const response = await fetch("/api/favorites", { cache: "no-store" });
      if (response.status === 401) {
        publish({ loaded: true, authenticated: false, ids: new Set(), photos: [] });
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить избранное");
      const photos = Array.isArray(data.photos) ? data.photos : [];
      const ids = new Set<string>(Array.isArray(data.ids) ? data.ids.map(String) : photos.map((photo: GalleryPhoto) => String(photo.id)));
      publish({ loaded: true, authenticated: true, ids, photos });
    } catch {
      publish({ ...state, loaded: true });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

async function toggleFavorite(photoId: string) {
  if (!state.loaded) await loadFavorites();
  if (!state.authenticated) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
    return;
  }

  const wasActive = state.ids.has(photoId);
  const optimisticIds = new Set(state.ids);
  if (wasActive) optimisticIds.delete(photoId); else optimisticIds.add(photoId);
  publish({ ...state, ids: optimisticIds, photos: wasActive ? state.photos.filter((photo) => photo.id !== photoId) : state.photos });

  try {
    const response = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId, active: !wasActive }),
    });
    if (response.status === 401) {
      publish({ loaded: true, authenticated: false, ids: new Set(), photos: [] });
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось изменить избранное");

    const ids = new Set(state.ids);
    let photos = [...state.photos];
    if (data.active) {
      ids.add(photoId);
      if (data.photo) photos = [data.photo, ...photos.filter((photo) => photo.id !== photoId)];
    } else {
      ids.delete(photoId);
      photos = photos.filter((photo) => photo.id !== photoId);
    }
    publish({ loaded: true, authenticated: true, ids, photos });
  } catch {
    await loadFavorites(true);
  }
}

export function useFavorites() {
  const [snapshot, setSnapshot] = useState<FavoritesState>(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    void loadFavorites();
    return () => { listeners.delete(setSnapshot); };
  }, []);

  const toggle = useCallback((photoId: string) => toggleFavorite(photoId), []);
  const refresh = useCallback(() => loadFavorites(true), []);
  return { ...snapshot, toggle, refresh };
}
