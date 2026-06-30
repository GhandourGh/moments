/**
 * Thin photo API client. Reads the backend base URL from VITE_API_BASE at
 * build time and the event id from VITE_EVENT_ID or ?event= in the URL.
 *
 * Backend contract (main.py):
 *   POST  {base}/events/{id}/photos   multipart: files=<jpeg> → { accepted, skipped, total }
 *   GET   {base}/events/{id}/photos   → { photo_ids, total }
 *   POST  {base}/events/{id}/match    multipart: selfie=<jpeg> → { photo_ids, matched, ... }
 */

const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

function getEventId() {
  const fromEnv = import.meta.env.VITE_EVENT_ID;
  if (fromEnv) return String(fromEnv);
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("event") || "";
  }
  return "";
}

function photoUrl(eventId, photoId) {
  return `${BASE}/events/${eventId}/photos/${photoId}`;
}

export function hasBackend() {
  return BASE.length > 0 && Boolean(getEventId());
}

export async function uploadShot(blob, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const eventId = getEventId();
  const body = new FormData();
  body.append("files", blob, "shot.jpg");
  const res = await fetch(`${BASE}/events/${eventId}/photos`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const data = await res.json();
  const id = data.accepted?.[0];
  if (!id) throw new Error("upload rejected");
  return { ok: true, id, url: photoUrl(eventId, id), takenAt: Date.now() };
}

export async function fetchShotsSince(since, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const eventId = getEventId();
  const res = await fetch(`${BASE}/events/${eventId}/photos`, { signal });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();
  const shots = (data.photo_ids || []).map((id) => ({
    id,
    url: photoUrl(eventId, id),
    takenAt: Date.now(),
  }));
  return { ok: true, shots };
}

export async function matchSelfie(blob, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const eventId = getEventId();
  const body = new FormData();
  body.append("selfie", blob, "selfie.jpg");
  const res = await fetch(`${BASE}/events/${eventId}/match`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(`match failed: ${res.status}`);
  const data = await res.json();
  return { ok: true, matches: data.photo_ids || [] };
}
