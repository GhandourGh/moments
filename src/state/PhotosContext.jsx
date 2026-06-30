import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SEED_SHOTS } from "../seed.js";
import { deleteShot, listShots } from "./photoStore.js";
import { enqueue, subscribe } from "./uploadQueue.js";
import { fetchShotsSince, hasBackend } from "../lib/api.js";

const POLL_MS = 10_000;

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
  const [hydrated, setHydrated] = useState(false);
  const blobUrls = useRef(new Set());

  const trackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.add(url);
  }, []);

  const untrackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.delete(url);
  }, []);

  // On mount, pull persisted captures and prepend (newest first). Flip
  // `hydrated` after the merge so the UI can hold a skeleton until the
  // real list is in hand (avoids the seed → captured prepend flash).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await listShots();
      if (cancelled) return;
      if (persisted.length) {
        const rehydrated = persisted
          .sort((a, b) => b.takenAt - a.takenAt)
          .map((r) => {
            const url = URL.createObjectURL(r.blob);
            trackUrl(url);
            return {
              id: r.id,
              url,
              takenAt: r.takenAt,
              status: r.status ?? "local",
              serverUrl: r.serverUrl,
              mediaType: r.mediaType ?? "photo",
            };
          });
        setShots((prev) => {
          const seen = new Set(rehydrated.map((h) => h.id));
          return [...rehydrated, ...prev.filter((s) => !seen.has(s.id))];
        });
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [trackUrl]);

  useEffect(() => () => {
    blobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrls.current.clear();
  }, []);

  const addShot = useCallback((blob, { mediaType = "photo" } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const takenAt = Date.now();
    const url = URL.createObjectURL(blob);
    // Backend only accepts photos right now — videos stay local.
    const status = mediaType === "photo" && hasBackend() ? "pending" : "local";
    trackUrl(url);
    setShots((prev) => [{ id, url, takenAt, status, mediaType }, ...prev]);
    enqueue({ id, blob, takenAt, mediaType });
    return { id, url };
  }, [trackUrl]);

  // Reflect queue status changes (synced / failed / pending-retry) into UI.
  useEffect(() => {
    return subscribe((id, patch) => {
      setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    });
  }, []);

  // Real-time gallery: poll the backend for shots taken by other guests and
  // merge any we haven't seen yet. Pauses when the tab is hidden so the
  // request budget stays sane. No-op when no backend is configured.
  useEffect(() => {
    if (!hasBackend()) return;
    let cancelled = false;
    let timer = null;
    let since = 0;

    async function poll() {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetchShotsSince(since);
        if (res.ok && Array.isArray(res.shots) && res.shots.length) {
          setShots((prev) => {
            const known = new Set(prev.map((s) => s.serverId || s.id));
            const fresh = res.shots
              .filter((r) => !known.has(r.id))
              .map((r) => ({
                id: r.id,
                serverId: r.id,
                serverUrl: r.url,
                url: r.url,
                takenAt: r.takenAt,
                status: "synced",
              }));
            if (!fresh.length) return prev;
            since = Math.max(since, ...fresh.map((s) => s.takenAt));
            return [...fresh, ...prev].sort((a, b) => b.takenAt - a.takenAt);
          });
          since = Math.max(since, ...res.shots.map((r) => r.takenAt));
        }
      } catch { /* one bad poll never breaks the loop */ }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    function onVisible() { if (!document.hidden) poll(); }
    document.addEventListener("visibilitychange", onVisible);
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
    <PhotosContext.Provider value={{ shots, hydrated, addShot, removeShot }}>
      {children}
    </PhotosContext.Provider>
  );
}

export function usePhotos() {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside <PhotosProvider>");
  return ctx;
}
