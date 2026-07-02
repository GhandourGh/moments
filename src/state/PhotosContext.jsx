import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SEED_SHOTS } from '@/data/seed.js';
import { deleteShot, listShots } from '@/services/storage/photoStore.js';
import { enqueue, subscribe, tick } from '@/services/storage/uploadQueue.js';
import { createSession, fetchShotsSince, getEventId, getServerGuestId, hasBackend } from '@/services/api/index.js';
import { getGuest, subscribeGuest } from '@/state/guest.js';
import { preserveShotUrls, readSessionShots, writeShotsCache, clearLegacyShotsCache } from '@/state/shotsCache.js';

const POLL_MS = 10_000;

function bootShots() {
  if (!hasBackend()) return SEED_SHOTS;
  return readSessionShots(getEventId());
}

function bootHydrated() {
  if (!hasBackend()) return true;
  return readSessionShots(getEventId()).length > 0;
}

const PhotosContext = createContext(null);

function rehydrateRecord(r, trackUrl) {
  try {
    const serverId = r.serverId ?? null;
    const base = {
      takenAt: r.takenAt,
      status: r.status ?? "local",
      serverUrl: r.serverUrl,
      serverId,
      mediaType: r.mediaType ?? "photo",
      guestId: r.guestId,
      guestFirstName: r.guestFirstName,
      guestLastName: r.guestLastName,
    };
    // Prefer the signed server URL when we have it (survives refresh even if
    // the blob was evicted from IndexedDB).
    if (r.serverUrl) {
      return { id: serverId || r.id, url: r.serverUrl, ...base };
    }
    if (r.blob) {
      const url = URL.createObjectURL(r.blob);
      trackUrl(url);
      return { id: r.id, url, ...base };
    }
    // Synced on server but no local blob / cached URL — keep the row so the
    // gallery poll can attach a signed URL after refresh.
    if (serverId) {
      return { id: serverId, url: "", ...base };
    }
    return null;
  } catch {
    return null;
  }
}

function mergeServerShots(prev, serverShots) {
  const known = new Set(prev.map((s) => s.serverId || s.id));
  const fresh = serverShots
    .filter((r) => !known.has(r.id))
    .map((r) => ({
      id: r.id,
      serverId: r.id,
      serverUrl: r.url,
      url: r.url ?? "",
      thumbUrl: r.thumbUrl ?? "",
      takenAt: r.takenAt,
      status: "synced",
      mediaType: r.mediaType ?? "photo",
      guestId: r.guestId,
      guestFirstName: r.guestFirstName,
      guestLastName: r.guestLastName,
    }));
  const byServerId = new Map(serverShots.map((r) => [r.id, r]));
  let next = prev.map((s) => {
    if (!s.serverId) return s;
    const echo = byServerId.get(s.serverId);
    if (!echo) return s;
    const patch = {
      guestId: echo.guestId,
      guestFirstName: echo.guestFirstName,
      guestLastName: echo.guestLastName,
    };
    if (!echo.url) return { ...s, ...patch, thumbUrl: s.thumbUrl || echo.thumbUrl || "" };
    return {
      ...s,
      ...patch,
      url: echo.url,
      serverUrl: echo.url,
      thumbUrl: echo.thumbUrl || s.thumbUrl || "",
    };
  });
  if (fresh.length) {
    next = [...fresh, ...next].sort((a, b) => b.takenAt - a.takenAt);
  }
  return next;
}

/** Drop server rows that no longer exist; keep pending local uploads. */
function reconcileServerShots(prev, serverShots) {
  const serverIds = new Set(serverShots.map((r) => r.id));
  const merged = mergeServerShots(prev, serverShots);
  return merged.filter((s) => {
    if (s.seed) return false;
    if (!s.serverId) return true;
    return serverIds.has(s.serverId);
  });
}

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
  const [shots, setShots] = useState(bootShots);
  const [hydrated, setHydrated] = useState(bootHydrated);
  const blobUrls = useRef(new Set());
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const trackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.add(url);
  }, []);

  const untrackUrl = useCallback((url) => {
    if (url?.startsWith("blob:")) blobUrls.current.delete(url);
  }, []);

  const bootstrapGallery = useCallback(async (isCancelled) => {
    const eventId = getEventId();
    clearLegacyShotsCache(eventId);

    const [persisted, serverRes] = await Promise.all([
      listShots(eventId),
      (async () => {
        if (!hasBackend()) return { ok: false, shots: [] };
        if (getGuest()) await createSession().catch(() => {});
        if (isCancelled()) return { ok: false, shots: [] };
        try {
          return await fetchShotsSince(0);
        } catch {
          return { ok: false, shots: [] };
        }
      })(),
    ]);
    if (isCancelled()) return null;

    let merged = persisted
      .sort((a, b) => b.takenAt - a.takenAt)
      .map((r) => rehydrateRecord(r, trackUrl))
      .filter(Boolean);

    if (serverRes.ok && Array.isArray(serverRes.shots)) {
      merged = reconcileServerShots(merged, serverRes.shots);
    }

    if (!hasBackend() && !merged.length) return SEED_SHOTS;
    return merged;
  }, [trackUrl]);

  const applyShots = useCallback((merged) => {
    const urlHints = readSessionShots(getEventId());
    const next = preserveShotUrls(urlHints, merged);
    setShots(next);
    writeShotsCache(getEventId(), next);
  }, []);

  // On mount (and when the guest registers after the welcome modal), rebuild
  // from IndexedDB + a full server fetch so refresh shows uploaded photos
  // even when local blob storage failed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await bootstrapGallery(() => cancelled);
      if (cancelled || merged == null) return;
      applyShots(merged);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [bootstrapGallery, applyShots]);

  useEffect(() => {
    if (!hasBackend()) return undefined;
    let cancelled = false;
    const unsub = subscribeGuest(() => {
      if (!getGuest() || cancelled) return;
      (async () => {
        const merged = await bootstrapGallery(() => cancelled);
        if (cancelled || merged == null) return;
        applyShots(merged);
        tick();
      })();
    });
    return () => { cancelled = true; unsub(); };
  }, [bootstrapGallery, applyShots]);

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
      guestId: getServerGuestId() || guest.id,
      guestFirstName: guest.firstName,
      guestLastName: guest.lastName,
    };
    trackUrl(url);
    setShots((prev) => {
      const next = [{ id, url, takenAt, status, mediaType, ...attribution }, ...prev];
      writeShotsCache(getEventId(), next);
      return next;
    });
    enqueue({ id, blob, takenAt, mediaType, ...attribution });
    return { id, url };
  }, [trackUrl]);

  // Reflect queue status changes (synced / failed / pending-retry) into UI.
  useEffect(() => {
    return subscribe((id, patch) => {
      setShots((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        writeShotsCache(getEventId(), next);
        return next;
      });
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

    let pollCount = 0;
    const FULL_SYNC_EVERY = 6;

    async function poll() {
      // A visibility flap can invoke poll() while a scheduled one is pending;
      // without clearing it, each flap adds a parallel poll chain that never
      // dies. One timer, one chain.
      if (timer) { clearTimeout(timer); timer = null; }
      if (cancelled || document.hidden) return;
      if (!getGuest()) {
        if (!cancelled && !timer) timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        await createSession().catch(() => {});
        pollCount += 1;
        const needsUrls = shotsRef.current.some((s) => s.serverId && !s.url);
        const fullSync = needsUrls || pollCount % FULL_SYNC_EVERY === 0;
        const res = await fetchShotsSince(fullSync ? 0 : since);
        if (res.ok && Array.isArray(res.shots)) {
          setShots((prev) => {
            const merged = fullSync
              ? reconcileServerShots(prev, res.shots)
              : mergeServerShots(prev, res.shots);
            const next = fullSync
              ? merged
              : preserveShotUrls(prev, merged);
            writeShotsCache(getEventId(), next);
            return next;
          });
          if (!fullSync && res.shots.length) {
            const maxTakenAt = Math.max(...res.shots.map((r) => r.takenAt));
            since = Math.max(since, maxTakenAt - 60_000);
          }
        }
      } catch { /* one bad poll never breaks the loop */ }
      if (!cancelled && !timer) timer = setTimeout(poll, POLL_MS);
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
        if (gone.url?.startsWith("blob:")) {
          URL.revokeObjectURL(gone.url);
          untrackUrl(gone.url);
        }
        deleteShot(gone.serverId || id);
      }
      const next = prev.filter((s) => s.id !== id);
      writeShotsCache(getEventId(), next);
      return next;
    });
  }, [untrackUrl]);

  const galleryHasShots = hydrated && shots.some((s) => !s.seed && s.mediaType !== "video");

  return (
    <PhotosContext.Provider value={{ shots, hydrated, galleryHasShots, addShot, removeShot }}>
      {children}
    </PhotosContext.Provider>
  );
}

export function usePhotos() {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside <PhotosProvider>");
  return ctx;
}
