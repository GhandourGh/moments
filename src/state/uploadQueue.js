/**
 * Upload queue. Walks the IDB shot store, uploads anything in `pending`,
 * and emits status changes so the UI can render dots / badges.
 *
 * Design: single in-flight upload at a time (venues have bad Wi-Fi; serial
 * is gentler than parallel). Exponential backoff on failure, capped. A
 * window `online` event triggers an immediate retry.
 */

import { hasBackend, uploadShot } from "../lib/api.js";
import { listShots, putShot } from "./photoStore.js";

const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [0, 2_000, 8_000, 30_000, 60_000, 120_000];

const listeners = new Set();
let running = false;
let retryTimer = null;

function emit(id, patch) {
  listeners.forEach((cb) => {
    try { cb(id, patch); } catch { /* listener errors must not break the queue */ }
  });
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Push a freshly captured shot into the queue. */
export async function enqueue(record) {
  const isPhoto = (record.mediaType ?? "photo") === "photo";
  // Backend currently only ingests stills — videos are persisted locally
  // but never queued for upload.
  const status = isPhoto && hasBackend() ? "pending" : "local";
  await putShot({ ...record, status, attempts: 0 });
  if (status === "pending") tick();
}

/** Best-effort drain. Safe to call at any time; the lock keeps it single-flight. */
export async function tick() {
  if (running) return;
  if (!hasBackend()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    const all = await listShots();
    const pending = all
      .filter((r) => (r.status ?? "local") === "pending")
      .sort((a, b) => a.takenAt - b.takenAt);
    for (const rec of pending) {
      const ok = await uploadOne(rec);
      if (!ok) break; // back off; the retry timer will re-tick
    }
  } finally {
    running = false;
  }
}

async function uploadOne(rec) {
  try {
    const result = await uploadShot(rec.blob);
    if (!result.ok) return false;
    const next = {
      ...rec,
      status: "synced",
      serverId: result.id,
      serverUrl: result.url,
    };
    await putShot(next);
    emit(rec.id, { status: "synced", serverId: result.id, serverUrl: result.url });
    return true;
  } catch {
    const attempts = (rec.attempts ?? 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const next = { ...rec, attempts, status: failed ? "failed" : "pending" };
    await putShot(next);
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
  const all = await listShots();
  const rec = all.find((r) => r.id === id);
  if (!rec) return;
  await putShot({ ...rec, status: "pending", attempts: 0 });
  emit(id, { status: "pending", attempts: 0 });
  tick();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => tick());
  // First drain after page load — catches anything left pending from a prior session.
  if (document.readyState === "complete") tick();
  else window.addEventListener("load", () => tick(), { once: true });
}
