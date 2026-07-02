/**
 * HTTP client for the Moment backend (docs/api-contract.md).
 *
 * Base URL comes from VITE_API_BASE ("" = local-only mode: photos stay in
 * IndexedDB, no server calls). Event comes from the /e/:eventSlug URL
 * segment via state/activeEvent (set by EventBoundary); VITE_EVENT_ID is a
 * dev-only convenience fallback. Every non-session call rides the
 * moment.sid cookie (credentials: "include"); on a 401 the client
 * transparently re-creates the session from localStorage and retries once
 * (docs/auth.md).
 */

import { env } from '@/config/env.js';
import { getGuest } from '@/state/guest.js';
import { getActiveEvent } from '@/state/activeEvent.js';

const BASE = env.api.base;

export function getEventId() {
  const active = getActiveEvent();
  if (active) return active;
  // Dev-only fallback: lets `vite dev` hit a fixed event without a /e/ URL.
  // In production the ONLY source of truth is the URL slug — a build-time
  // fallback here is how uploads used to leak into the wrong event.
  if (import.meta.env.DEV) return env.api.eventId || "";
  return "";
}

export function hasBackend() {
  if (!getEventId()) return false;
  // Production serves /api on the same origin — an empty VITE_API_BASE still
  // works via relative paths. Treating empty BASE as "local-only" here was
  // skipping uploads + server gallery hydration, so photos vanished on refresh
  // whenever IndexedDB didn't keep the blob.
  if (import.meta.env.PROD) return true;
  return BASE.length > 0;
}

function url(path) {
  return `${BASE}${path}`;
}

class ApiError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = "GET", body, headers, signal, retryAuth = true } = {}) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url(path), {
    method,
    body: isForm || body == null ? body : JSON.stringify(body),
    headers: { ...(isForm || body == null ? {} : { "content-type": "application/json" }), ...headers },
    credentials: "include",
    signal,
  });
  if (res.status === 401 && retryAuth && path !== "/api/session") {
    const ok = await createSession().then((r) => r.ok).catch(() => false);
    if (ok) return request(path, { method, body, headers, signal, retryAuth: false });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.code || "http_error", res.status, data.error);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

let sessionPromise = null;

/** POST /api/session from the guest in localStorage. Deduped while in flight. */
export function createSession() {
  if (!hasBackend()) return Promise.resolve({ ok: false, reason: "no-backend" });
  const guest = getGuest();
  if (!guest) return Promise.resolve({ ok: false, reason: "no-guest" });
  if (sessionPromise) return sessionPromise;
  sessionPromise = request("/api/session", {
    method: "POST",
    retryAuth: false,
    body: {
      event: getEventId(),
      guestId: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
    },
  })
    .then((data) => ({ ok: true, ...data }))
    .finally(() => { sessionPromise = null; });
  return sessionPromise;
}

export async function patchSession({ firstName, lastName }) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  await request("/api/session", { method: "PATCH", body: { firstName, lastName } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function getEvent({ signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const data = await request(`/api/events/${encodeURIComponent(getEventId())}`, { signal });
  return { ok: true, event: data };
}

/** Fetch any event by uuid or slug — used by the /host editor. */
export async function fetchEvent(idOrSlug, { signal } = {}) {
  const data = await request(`/api/events/${encodeURIComponent(idOrSlug)}`, { signal, retryAuth: false });
  return { ok: true, event: data };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vercel caps request bodies ~4.5 MB — re-encode anything bigger. */
async function compressForUpload(blob) {
  if (blob.size <= 3.5 * 1024 * 1024) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

async function imageSize(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Upload one photo. Computes hash + dimensions, compresses if needed.
 */
export async function uploadShot(blob, { signal, takenAt } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const upload = await compressForUpload(blob);
  const [hash, size] = await Promise.all([sha256Hex(upload), imageSize(upload)]);

  const body = new FormData();
  body.append("file", upload, "shot.jpg");
  body.append("hash", hash);
  body.append("takenAt", new Date(takenAt ?? Date.now()).toISOString());
  body.append("width", String(size.width));
  body.append("height", String(size.height));

  const data = await request(`/api/events/${encodeURIComponent(getEventId())}/photos`, {
    method: "POST", body, signal,
  });
  const id = data.accepted?.[0] ?? data.skipped?.[0];
  if (!id) throw new ApiError("upload_rejected", 200, "upload rejected");
  return { ok: true, id, url: data.url ?? null, takenAt: takenAt ?? Date.now() };
}

/** Gallery hydration. `since` is epoch-ms or ISO; returns shots with signed URLs. */
export async function fetchShotsSince(since, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const params = new URLSearchParams();
  if (since) params.set("since", new Date(since).toISOString());
  const qs = params.toString();
  const data = await request(
    `/api/events/${encodeURIComponent(getEventId())}/photos${qs ? `?${qs}` : ""}`,
    { signal }
  );
  const shots = (data.photos || []).map((p) => ({
    id: p.id,
    url: p.url,
    takenAt: Date.parse(p.takenAt) || Date.now(),
    width: p.width,
    height: p.height,
    guestId: p.guest?.id,
    guestFirstName: p.guest?.firstName,
    guestLastName: p.guest?.lastName,
  }));
  return { ok: true, shots, total: data.total, nextCursor: data.nextCursor };
}

// ---------------------------------------------------------------------------
// Videos — two-step direct-to-storage upload (Vercel body cap; see
// api/events/[id]/videos.ts for the shape).
// ---------------------------------------------------------------------------

export async function uploadVideo(blob, { signal, takenAt, durationMs, width = 0, height = 0 } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const eventPath = `/api/events/${encodeURIComponent(getEventId())}/videos`;
  const hash = await sha256Hex(blob);
  const mime = blob.type || "video/webm";
  const meta = { hash, durationMs, width, height, mime, takenAt: new Date(takenAt ?? Date.now()).toISOString() };

  const init = await request(eventPath, { method: "POST", signal, body: { action: "init", ...meta } });
  if (init.duplicate) return { ok: true, id: init.videoId, takenAt: takenAt ?? Date.now() };

  const put = await fetch(init.uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "content-type": mime, "x-upsert": "false" },
    signal,
  });
  if (!put.ok) throw new ApiError("storage_upload_failed", put.status);

  const data = await request(eventPath, {
    method: "POST", signal,
    body: { action: "confirm", videoId: init.videoId, storageKey: init.storageKey, ...meta },
  });
  const id = data.accepted?.[0] ?? data.skipped?.[0];
  if (!id) throw new ApiError("upload_rejected", 200, "upload rejected");
  return { ok: true, id, takenAt: takenAt ?? Date.now() };
}

export async function fetchVideosSince(since, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const params = new URLSearchParams();
  if (since) params.set("since", new Date(since).toISOString());
  const qs = params.toString();
  const data = await request(
    `/api/events/${encodeURIComponent(getEventId())}/videos${qs ? `?${qs}` : ""}`,
    { signal }
  );
  const shots = (data.videos || []).map((v) => ({
    id: v.id,
    url: v.url,
    takenAt: Date.parse(v.takenAt) || Date.now(),
    durationMs: v.durationMs,
    guestId: v.guest?.id,
    guestFirstName: v.guest?.firstName,
    guestLastName: v.guest?.lastName,
  }));
  return { ok: true, shots, total: data.total };
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/**
 * "Find my photos": the selfie's descriptor is computed on-device
 * (services/faces) and only the 128-float vector goes to the server.
 */
export async function matchSelfie(blob, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const { descriptorForSelfie } = await import('@/services/faces/index.js');
  const embedding = await descriptorForSelfie(blob);
  if (!embedding) return { ok: false, reason: "no-face-detected" };
  const data = await request(`/api/events/${encodeURIComponent(getEventId())}/match`, {
    method: "POST", signal, body: { embedding },
  });
  return { ok: true, matches: data.photoIds || [], threshold: data.threshold };
}

/** Attach on-device face descriptors to photos indexed from /me. */
export async function postFaceEmbeddings(items, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const data = await request(`/api/events/${encodeURIComponent(getEventId())}/embeddings`, {
    method: "POST", signal, body: { items },
  });
  return { ok: true, indexed: data.indexed ?? 0 };
}

export async function moderatePhoto(blob, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const body = new FormData();
  body.append("file", blob, "photo.jpg");
  const data = await request("/api/ai/moderate", { method: "POST", body, signal });
  return { ok: true, ...data };
}

export async function captionPhoto(blob, { signal } = {}) {
  if (!hasBackend()) return { ok: false, reason: "no-backend" };
  const body = new FormData();
  body.append("file", blob, "photo.jpg");
  const data = await request("/api/ai/caption", { method: "POST", body, signal });
  return { ok: true, caption: data.caption };
}

// ---------------------------------------------------------------------------
// Host/admin — passcode-protected, used only by features/host.
// ---------------------------------------------------------------------------

export async function adminCreateEvent({ title, slug, startsAt, endsAt, content }, passcode) {
  const data = await request("/api/events", {
    method: "POST",
    retryAuth: false,
    headers: { "x-admin-passcode": passcode },
    body: { title, slug, startsAt, endsAt, content },
  });
  return { ok: true, event: data };
}

/** PATCH /api/events/:id — all of { title, startsAt, endsAt, content } optional. */
export async function adminUpdateEvent(idOrSlug, patch, passcode) {
  const data = await request(`/api/events/${encodeURIComponent(idOrSlug)}`, {
    method: "PATCH",
    retryAuth: false,
    headers: { "x-admin-passcode": passcode },
    body: patch,
  });
  return { ok: true, event: data };
}

/** Events pass through as-is — includes the per-event photos/videos counts. */
export async function adminListEvents(passcode) {
  const data = await request("/api/events", {
    retryAuth: false,
    headers: { "x-admin-passcode": passcode },
  });
  return { ok: true, events: data.events };
}

export async function adminDeleteEvent(idOrSlug, passcode) {
  const data = await request(`/api/events/${encodeURIComponent(idOrSlug)}`, {
    method: "DELETE",
    retryAuth: false,
    headers: { "x-admin-passcode": passcode },
  });
  return { ok: true, deletedPhotos: data.deletedPhotos, deletedVideos: data.deletedVideos };
}

/** Passcode-authed photo listing — no guest session needed server-side. */
export async function adminListPhotos(idOrSlug, passcode, { limit = 100, cursor } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const data = await request(
    `/api/events/${encodeURIComponent(idOrSlug)}/photos?${params}`,
    { retryAuth: false, headers: { "x-admin-passcode": passcode } }
  );
  return { ok: true, photos: data.photos, total: data.total, nextCursor: data.nextCursor };
}

export async function adminDeletePhoto(idOrSlug, photoId, passcode) {
  const data = await request(
    `/api/events/${encodeURIComponent(idOrSlug)}/photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE", retryAuth: false, headers: { "x-admin-passcode": passcode } }
  );
  return { ok: true, ...data };
}

/** Upload a hero / cover image for an event (signed URL + storage key returned). */
export async function adminUploadHeroImage(idOrSlug, blob, passcode) {
  const body = new FormData();
  body.append("file", blob, "hero.jpg");
  const data = await request(`/api/events/${encodeURIComponent(idOrSlug)}/cover`, {
    method: "POST",
    retryAuth: false,
    headers: { "x-admin-passcode": passcode },
    body,
  });
  return { ok: true, url: data.url, storageKey: data.storageKey };
}
