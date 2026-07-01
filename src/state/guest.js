/**
 * Guest identity — first + last name, per-device.
 *
 * Persisted to localStorage under `moment.guest.v1`. The `id` is a UUID minted
 * on first save and never regenerated — the server will pin the same value to
 * a `guests` row when the backend lands (see docs/auth.md).
 *
 * Features MUST go through this module — do not touch localStorage directly.
 * A change event is emitted on every write so React subscribers re-render
 * without prop-drilling.
 */

const KEY = "moment.guest.v1";
const CHANGE_EVENT = "moment:guest-change";
const NAME_MIN = 1;
const NAME_MAX = 40;

let cached = null;
let loaded = false;

function readOnce() {
  if (loaded) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

function mintId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — shape doesn't need to be a strict UUID.
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True if `v` is a valid first- or last-name. Trims before checking. */
export function isValidName(v) {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length < NAME_MIN || t.length > NAME_MAX) return false;
  // Letters (any language) + spaces, hyphens, apostrophes. First char must be a letter.
  return /^\p{L}[\p{L}\s'\-]*$/u.test(t);
}

export function getGuest() {
  return readOnce();
}

/** Create-or-replace the guest record. Throws on invalid input. */
export function setGuest({ firstName, lastName }) {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  if (!isValidName(first) || !isValidName(last)) {
    const err = new Error("invalid-name");
    err.code = "invalid-name";
    throw err;
  }
  const existing = readOnce();
  const record = {
    id: existing?.id ?? mintId(),
    firstName: first,
    lastName: last,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* private mode — persistence is best-effort; runtime cache still works */
  }
  cached = record;
  loaded = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: record }));
  }
  return record;
}

/** Partial edit. If no guest exists yet, treats this as an initial `setGuest`. */
export function updateGuest(patch) {
  const existing = readOnce();
  if (!existing) return setGuest(patch);
  return setGuest({
    firstName: patch.firstName ?? existing.firstName,
    lastName: patch.lastName ?? existing.lastName,
  });
}

/** Subscribe to changes. Fires on writes in this tab AND cross-tab via `storage`. */
export function subscribeGuest(cb) {
  if (typeof window === "undefined") return () => {};
  const onLocal = (e) => cb(e.detail);
  const onCrossTab = (e) => {
    if (e.key !== KEY) return;
    loaded = false;
    cb(readOnce());
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onCrossTab);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onCrossTab);
  };
}

/** Convenience — the string the UI shows. */
export function displayName(guest) {
  if (!guest) return "";
  return `${guest.firstName} ${guest.lastName}`.trim();
}
