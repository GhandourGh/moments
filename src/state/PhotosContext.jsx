import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SEED_SHOTS } from '@/data/seed.js';
import { deleteShot, listShots } from '@/services/storage/photoStore.js';
import { enqueue, subscribe } from '@/services/storage/uploadQueue.js';
import { fetchShotsSince, getEventId, hasBackend } from '@/services/api/index.js';
import { getGuest } from '@/state/guest.js';

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
 *
 * Event scoping: EventBoundary keys its Outlet by slug, so this provider
 * remounts (state wiped) whenever the guest moves to a different event;
 * hydration below re-reads only the active event's persisted shots.
 */
export function PhotosProvider({ children }) {
  // Seeds are dev/offline furniture — with a live backend the gallery must
  // show only real captures, so seed placeholders never mix with them.
  const [shots, setShots] = useState(hasBackend() ? [] : SEED_SHOTS);
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
      // Only this event's captures. In local-only mode getEventId() is ""
      // and listShots returns everything — same behavior as before.
      const persisted = await listShots(getEventId());
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
              guestId: r.guestId,
              guestFirstName: r.guestFirstName,
              guestLastName: r.guestLastName,
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
    // Attribution is required. If the welcome gate somehow let us here without
    // a guest, refuse the capture — better than orphaning the photo.
    const guest = getGuest();
    if (!guest) return null;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const takenAt = Date.now();
    const url = URL.createObjectURL(blob);
    const status = hasBackend() ? "pending" : "local";
    const attribution = {
      guestId: guest.id,
      guestFirstName: guest.firstName,
      guestLastName: guest.lastName,
    };
    trackUrl(url);
    setShots((prev) => [{ id, url, takenAt, status, mediaType, ...attribution }, ...prev]);
    enqueue({ id, blob, takenAt, mediaType, ...attribution });
    return { id, url };
  }, [trackUrl]);

  // NOTE: name edits from /me deliberately do NOT rewrite past attributions.
  // Snapshot-not-backfill — matches docs/auth.md and docs/privacy.md. If you
  // ever need to backfill, do it explicitly, not as a side effect of an edit.

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
                // Attribution must survive the trip — the lightbox caption
                // ("by First Last · time") reads these fields.
                guestId: r.guestId,
                guestFirstName: r.guestFirstName,
                guestLastName: r.guestLastName,
              }));
            // Backfill serverUrl on our own uploads when the poll echoes
            // them back, so every synced record carries the server copy.
            const byServerId = new Map(res.shots.map((r) => [r.id, r]));
            let next = prev.map((s) => {
              if (!s.serverId || s.serverUrl) return s;
              const echo = byServerId.get(s.serverId);
              return echo ? { ...s, serverUrl: echo.url } : s;
            });
            if (fresh.length) {
              next = [...fresh, ...next].sort((a, b) => b.takenAt - a.takenAt);
            }
            return next;
          });
          // Keep a 60s overlap: another phone's slow upload can land with a
          // client takenAt older than our cursor. Re-fetching the window is
          // cheap and the id dedupe above eats the repeats.
          const maxTakenAt = Math.max(...res.shots.map((r) => r.takenAt));
          since = Math.max(since, maxTakenAt - 60_000);
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
