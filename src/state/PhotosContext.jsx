import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SEED_SHOTS } from "../seed.js";
import { deleteShot, listShots, putShot } from "./photoStore.js";

const PhotosContext = createContext(null);

/**
 * Photo store: seeds the gallery with placeholders, persists captures to
 * IndexedDB so a refresh doesn't wipe them, and exposes the same shape
 * the UI was already using.
 *
 * Shot record: { id, url, takenAt, seed?: true }
 * Seed shots are not persisted (they're just URLs to /public/seed/*).
 * Captured shots are persisted as Blobs, rehydrated to object URLs on load.
 */
export function PhotosProvider({ children }) {
  const [shots, setShots] = useState(SEED_SHOTS);
  const blobUrls = useRef(new Set());

  const trackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.add(url);
  }, []);

  const untrackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.delete(url);
  }, []);

  // On mount, pull persisted captures and prepend (newest first).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await listShots();
      if (cancelled || !persisted.length) return;
      const hydrated = persisted
        .sort((a, b) => b.takenAt - a.takenAt)
        .map((r) => {
          const url = URL.createObjectURL(r.blob);
          trackUrl(url);
          return { id: r.id, url, takenAt: r.takenAt };
        });
      setShots((prev) => {
        const seen = new Set(hydrated.map((h) => h.id));
        return [...hydrated, ...prev.filter((s) => !seen.has(s.id))];
      });
    })();
    return () => { cancelled = true; };
  }, [trackUrl]);

  useEffect(() => () => {
    blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrls.current.clear();
  }, []);

  const addShot = useCallback((blob) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const takenAt = Date.now();
    const url = URL.createObjectURL(blob);
    trackUrl(url);
    setShots((prev) => [{ id, url, takenAt }, ...prev]);
    putShot({ id, blob, takenAt });
    return { id, url };
  }, [trackUrl]);

  const removeShot = useCallback((id) => {
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone && !gone.seed) {
        URL.revokeObjectURL(gone.url);
        untrackUrl(gone.url);
        deleteShot(id);
      }
      return prev.filter((s) => s.id !== id);
    });
  }, [untrackUrl]);

  return (
    <PhotosContext.Provider value={{ shots, addShot, removeShot }}>
      {children}
    </PhotosContext.Provider>
  );
}

export function usePhotos() {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside <PhotosProvider>");
  return ctx;
}
