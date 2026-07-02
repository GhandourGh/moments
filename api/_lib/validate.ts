/**
 * Input validation shared across endpoints. Name rules mirror
 * src/state/guest.js exactly — the server must never reject a name the
 * client accepted.
 */

export function isValidName(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length < 1 || t.length > 40) return false;
  return /^\p{L}[\p{L}\s'\-]*$/u.test(t);
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Client-minted guest ids are UUIDs, with a legacy `g-...` fallback shape. */
export function isGuestId(v: unknown): v is string {
  return isUuid(v) || (typeof v === "string" && /^g-[a-z0-9]+-[a-z0-9]+$/.test(v));
}

export function isSlug(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(v);
}

/** Per-event frontend content document: plain object, capped at 32 KB. */
export function validContent(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return JSON.stringify(v).length <= 32_768;
}

export function isSha256(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
}
