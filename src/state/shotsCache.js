/**
 * Gallery snapshot cache — session-confirmed only (no stale deletes on refresh).
 * localStorage is a legacy fallback we no longer read on boot.
 */

const SESSION_PREFIX = "fg.shots.session.v1.";
const LEGACY_PREFIX = "fg.shots.v1.";
const MAX_SHOTS = 32;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slimShot(s) {
  if (!s || s.seed) return null;
  const httpUrl = s.serverUrl
    || (typeof s.url === "string" && s.url.startsWith("http") ? s.url : "");
  if (!httpUrl && !s.serverId) return null;
  return {
    id: s.serverId || s.id,
    serverId: s.serverId || null,
    url: httpUrl,
    serverUrl: httpUrl,
    takenAt: s.takenAt,
    status: s.status ?? "synced",
    mediaType: s.mediaType ?? "photo",
    guestId: s.guestId,
    guestFirstName: s.guestFirstName,
    guestLastName: s.guestLastName,
  };
}

function readFromStore(store, prefix, eventId) {
  if (!eventId) return [];
  try {
    const raw = store.getItem(prefix + eventId);
    if (!raw) return [];
    const { savedAt, shots } = JSON.parse(raw);
    if (!Array.isArray(shots) || Date.now() - savedAt > TTL_MS) {
      store.removeItem(prefix + eventId);
      return [];
    }
    return shots
      .filter((s) => s && s.mediaType !== "video")
      .slice(0, MAX_SHOTS);
  } catch {
    return [];
  }
}

function writeToStore(store, prefix, eventId, shots) {
  if (!eventId) return;
  try {
    const slim = shots
      .map(slimShot)
      .filter(Boolean)
      .slice(0, MAX_SHOTS);
    if (!slim.length) {
      store.removeItem(prefix + eventId);
      return;
    }
    store.setItem(prefix + eventId, JSON.stringify({ savedAt: Date.now(), shots: slim }));
  } catch { /* quota / private mode */ }
}

/** URL hints from the last server-confirmed gallery in this tab. */
export function readSessionShots(eventId) {
  if (typeof sessionStorage === "undefined") return [];
  return readFromStore(sessionStorage, SESSION_PREFIX, eventId);
}

export function writeSessionShots(eventId, shots) {
  if (typeof sessionStorage === "undefined") return;
  writeToStore(sessionStorage, SESSION_PREFIX, eventId, shots);
}

/** @deprecated Legacy localStorage — kept for purge-on-delete only. */
export function readShotsCache(eventId) {
  return readFromStore(localStorage, LEGACY_PREFIX, eventId);
}

export function writeShotsCache(eventId, shots) {
  writeToStore(localStorage, LEGACY_PREFIX, eventId, shots);
  writeSessionShots(eventId, shots);
}

/** Drop deleted server photos from every cache layer (admin / host delete). */
export function removeShotsFromCache(eventId, photoIds) {
  if (!eventId || !photoIds?.length) return;
  const drop = new Set(photoIds.map(String));
  const filter = (list) => list.filter((s) => !drop.has(String(s.serverId || s.id)));

  if (typeof sessionStorage !== "undefined") {
    const session = filter(readSessionShots(eventId));
    writeToStore(sessionStorage, SESSION_PREFIX, eventId, session);
  }
  const legacy = filter(readShotsCache(eventId));
  writeToStore(localStorage, LEGACY_PREFIX, eventId, legacy);
}

/** Keep prior URLs when a refresh pass returns rows before signed URLs land. */
export function preserveShotUrls(prev, next) {
  if (!next.length) return next;
  const byKey = new Map(prev.map((s) => [s.serverId || s.id, s]));
  return next.map((s) => {
    const key = s.serverId || s.id;
    const old = byKey.get(key);
    if (old?.url && !s.url) {
      return {
        ...s,
        url: old.url,
        serverUrl: old.serverUrl || old.url,
      };
    }
    return s;
  });
}

/** Clear legacy localStorage entries that caused deleted-photo flashes. */
export function clearLegacyShotsCache(eventId) {
  if (!eventId) return;
  try {
    localStorage.removeItem(LEGACY_PREFIX + eventId);
  } catch { /* private mode */ }
}
