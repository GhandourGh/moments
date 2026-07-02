/**
 * Tiny IndexedDB wrapper for persisting captured photos across page reloads.
 * Zero deps; uses the raw IndexedDB API.
 *
 * Records:  { id, blob, takenAt, eventId?, status?, serverId?, serverUrl?,
 *             attempts?, guestId?, guestFirstName?, guestLastName? }
 *   status: "local" | "pending" | "synced" | "failed"
 *   Records without `status` were written by an earlier build — treat as "local".
 *   Records without `eventId` predate multi-event support and are excluded
 *   from event-filtered listings.
 * Object store keyPath: "id"
 *
 * Persistence must stay ON: the upload queue is driven entirely by this
 * store (enqueue → putShot, tick → listShots). With it off, captures never
 * reach the backend at all — that was the bug that shipped on 2026-07-02.
 */
const PERSIST_ENABLED = true;

const DB_NAME = "moments";
// v2: records gained `eventId`. No schema change — the field is filtered in
// code (listShots), so the upgrade handler stays a no-op beyond store creation.
const DB_VERSION = 2;
const STORE = "shots";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

/**
 * List persisted shots. With an `eventId` only that event's records come
 * back (legacy records with no eventId are excluded); without one, everything.
 */
export async function listShots(eventId) {
  if (!PERSIST_ENABLED) return [];
  try {
    const store = await tx("readonly");
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return eventId ? all.filter((r) => r.eventId === eventId) : all;
  } catch {
    return []; // private mode, blocked, etc. — degrade silently
  }
}

export async function putShot(record) {
  if (!PERSIST_ENABLED) return;
  try {
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* persistence is best-effort */
  }
}

export async function deleteShot(id) {
  if (!PERSIST_ENABLED) return;
  try {
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* same — best effort */
  }
}
