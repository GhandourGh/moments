/**
 * Upload queue. Walks the IDB shot store, uploads anything in `pending`,
 * and emits status changes so the UI can render dots / badges.
 *
 * Design: single in-flight upload at a time (venues have bad Wi-Fi; serial
 * is gentler than parallel). Exponential backoff on failure, capped. A
 * window `online` event triggers an immediate retry.
 *
 * IDB can be unavailable entirely (iOS private mode) — putShot no-ops and
 * listShots returns []. A module-level Map mirrors every enqueued record so
 * uploads still happen this session even with persistence dead; tick()
 * drains the union of IDB + Map, deduped by id.
 */

import { hasBackend, getEventId, uploadShot, uploadVideo, createSession } from '@/services/api/index.js';
import { subscribe as subscribeActiveEvent } from '@/state/activeEvent.js';
import { descriptorsForPhoto } from '@/services/faces/index.js';
import { moderatePhotoLocal } from '@/services/moderation/index.js';
import { listShots, putShot } from '@/services/storage/photoStore.js';

const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [0, 2_000, 8_000, 30_000, 60_000, 120_000];

const listeners = new Set();
let running = false;
let retryTimer = null;

/** In-memory mirror of queued records — the IDB-unavailable fallback. */
const memQueue = new Map();
let sessionFailures = 0;

function emit(id, patch) {
  listeners.forEach((cb) => {
    try { cb(id, patch); } catch { /* listener errors must not break the queue */ }
  });
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Write to both stores. IDB is best-effort; the Map is the safety net. */
async function saveRecord(rec) {
  if (rec.status === "synced") memQueue.delete(rec.id);
  else memQueue.set(rec.id, rec);
  await putShot(rec).catch(() => { /* quota / blocked — Map still has it */ });
}

/** IDB records + in-memory records the (possibly dead) IDB doesn't know about. */
async function allRecords() {
  const persisted = await listShots();
  const seen = new Set(persisted.map((r) => r.id));
  const extras = [...memQueue.values()].filter((r) => !seen.has(r.id));
  return [...persisted, ...extras];
}

/** Push a freshly captured shot into the queue. */
export async function enqueue(record) {
  const status = hasBackend() ? "pending" : "local";
  await saveRecord({ ...record, eventId: getEventId(), status, attempts: 0 });
  if (status === "pending") tick();
}

/** Best-effort drain. Safe to call at any time; the lock keeps it single-flight. */
export async function tick() {
  if (running) return;
  if (!hasBackend()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    const currentEvent = getEventId();
    // Only this event's shots upload now — records captured under another
    // slug stay queued until that event is active again.
    const pending = (await allRecords())
      .filter((r) => (r.status ?? "local") === "pending" && r.eventId === currentEvent)
      .sort((a, b) => a.takenAt - b.takenAt);
    if (!pending.length) return;

    // Session first — uploads 401 without the moment.sid cookie (docs/auth.md).
    // A hard failure surfaces as "failed" on the queued shots (with the usual
    // backoff-scheduled retry) instead of an eternal "uploading" spinner.
    const session = await createSession().catch((err) => ({ ok: false, reason: err?.message || "session-error" }));
    if (!session.ok) {
      sessionFailures += 1;
      console.warn("[uploads] session create failed:", session.reason);
      pending.forEach((rec) => emit(rec.id, { status: "failed", attempts: rec.attempts ?? 0 }));
      scheduleRetry(BACKOFF_MS[Math.min(sessionFailures, BACKOFF_MS.length - 1)]);
      return;
    }
    sessionFailures = 0;

    for (const rec of pending) {
      const ok = await uploadOne(rec);
      if (!ok) break; // back off; the retry timer will re-tick
    }
  } finally {
    running = false;
  }
}

/** Duration of a video blob in ms, measured via an off-DOM <video>. */
function measureDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    const done = (ms) => { URL.revokeObjectURL(url); resolve(ms); };
    video.onloadedmetadata = () => {
      const d = video.duration;
      done(isFinite(d) && d > 0 ? Math.round(d * 1000) : 0);
    };
    video.onerror = () => done(0);
    video.preload = "metadata";
    video.src = url;
  });
}

async function uploadOne(rec) {
  try {
    let result;
    if ((rec.mediaType ?? "photo") === "video") {
      const durationMs = rec.durationMs ?? (await measureDuration(rec.blob));
      if (!durationMs) throw new Error("unmeasurable video");
      result = await uploadVideo(rec.blob, { takenAt: rec.takenAt, durationMs });
    } else {
      // Free on-device screen before anything leaves the phone. Blocked
      // photos stay local; no retry — the verdict won't change.
      const verdict = await moderatePhotoLocal(rec.blob);
      if (!verdict.allowed) {
        await saveRecord({ ...rec, status: "failed", attempts: MAX_ATTEMPTS });
        emit(rec.id, { status: "failed", attempts: MAX_ATTEMPTS });
        return true; // keep draining the rest of the queue
      }
      // Face descriptors ride along with the upload; [] when detection is
      // off or finds nothing — never blocks the photo.
      const faces = await descriptorsForPhoto(rec.blob);
      result = await uploadShot(rec.blob, { takenAt: rec.takenAt, faces });
    }
    if (!result.ok) return false;
    const next = {
      ...rec,
      status: "synced",
      serverId: result.id,
      serverUrl: result.url,
    };
    await saveRecord(next);
    emit(rec.id, { status: "synced", serverId: result.id, serverUrl: result.url });
    return true;
  } catch {
    const attempts = (rec.attempts ?? 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const next = { ...rec, attempts, status: failed ? "failed" : "pending" };
    await saveRecord(next);
    emit(rec.id, { status: next.status, attempts });
    if (!failed) scheduleRetry(BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]);
    return false;
  }
}

function scheduleRetry(ms) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    tick();
  }, ms);
}

/** Manual retry from the UI (e.g. tap a failed-dot to retry). */
export async function retry(id) {
  const all = await allRecords();
  const rec = all.find((r) => r.id === id);
  if (!rec) return;
  await saveRecord({ ...rec, status: "pending", attempts: 0 });
  emit(id, { status: "pending", attempts: 0 });
  tick();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => tick());
  // Drain whenever an event becomes active — the load-time tick can fire
  // before the router has set the slug, and pending shots for another event
  // wait until the guest is back on that event.
  subscribeActiveEvent(() => tick());
  // First drain after page load — catches anything left pending from a prior session.
  if (document.readyState === "complete") tick();
  else window.addEventListener("load", () => tick(), { once: true });
}
