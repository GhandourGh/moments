/**
 * Per-slug event snapshot cache — instant paint on refresh while the
 * network revalidates. Hero uses a stable /api/events/:slug/hero URL so
 * the browser can cache the image across visits.
 */

const PREFIX = "fg.event.v1.";
/** Stay under the 24h signed-URL window (hero now uses stable URLs). */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function readEventCache(slug) {
  if (!slug) return null;
  try {
    const raw = localStorage.getItem(PREFIX + slug);
    if (!raw) return null;
    const { savedAt, event } = JSON.parse(raw);
    if (!event || Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + slug);
      return null;
    }
    return event;
  } catch {
    return null;
  }
}

export function writeEventCache(slug, event) {
  if (!slug || !event) return;
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify({ savedAt: Date.now(), event }));
  } catch { /* quota / private mode */ }
}

/** Warm the HTTP cache before the hero background paints. */
export function preloadHero(url) {
  if (!url || typeof url !== "string") return;
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "high";
  img.src = url;
}
