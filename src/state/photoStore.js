/**
 * Tiny IndexedDB wrapper for persisting captured photos across page reloads.
 * Zero deps; uses the raw IndexedDB API.
 *
 * Records:  { id: string, blob: Blob, takenAt: number }
 * Object store keyPath: "id"
 */

const DB_NAME = "facegather";
const DB_VERSION = 1;
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

export async function listShots() {
  try {
    const store = await tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return []; // private mode, blocked, etc. — degrade silently
  }
}

export async function putShot(record) {
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
