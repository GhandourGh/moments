/**
 * Lightweight per-event gallery snapshot for instant paint on refresh.
 * IndexedDB hydration is async — this keeps Just captured + memory cards
 * visible while IDB and the server catch up.
 */

const PREFIX = "fg.shots.v1.";
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

export function readShotsCache(eventId) {
  if (!eventId) return [];
  try {
    const raw = localStorage.getItem(PREFIX + eventId);
    if (!raw) return [];
    const { savedAt, shots } = JSON.parse(raw);
    if (!Array.isArray(shots) || Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + eventId);
      return [];
    }
    return shots
      .filter((s) => s && s.mediaType !== "video")
      .slice(0, MAX_SHOTS);
  } catch {
    return [];
  }
}

export function writeShotsCache(eventId, shots) {
  if (!eventId) return;
  try {
    const slim = shots
      .map(slimShot)
      .filter(Boolean)
      .slice(0, MAX_SHOTS);
    if (!slim.length) {
      localStorage.removeItem(PREFIX + eventId);
      return;
    }
    localStorage.setItem(PREFIX + eventId, JSON.stringify({ savedAt: Date.now(), shots: slim }));
  } catch { /* quota / private mode */ }
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
