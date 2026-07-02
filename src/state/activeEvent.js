/**
 * Active event — the slug from the /e/:eventSlug URL segment.
 *
 * Set by EventBoundary before any child renders, read by services/api
 * (getEventId) so every request is scoped to the event the guest is
 * actually looking at. Same plain-module-store pattern as state/guest.js
 * because non-React code (the API client, the upload queue) reads it too.
 *
 * The last-visited slug is persisted so the top-level 404 page can offer
 * a "back to your event" link after a bad deep link.
 */

const LAST_EVENT_KEY = "moment.lastEvent.v1";

let activeSlug = "";
const listeners = new Set();

export function getActiveEvent() {
  return activeSlug;
}

export function setActiveEvent(slug) {
  const next = typeof slug === "string" ? slug : "";
  if (next === activeSlug) return;
  activeSlug = next;
  if (next) {
    try {
      localStorage.setItem(LAST_EVENT_KEY, next);
    } catch { /* private mode — best effort */ }
  }
  listeners.forEach((cb) => {
    try { cb(activeSlug); } catch { /* one bad subscriber can't break the rest */ }
  });
}

/** Last slug this device visited, or "" — read from localStorage. */
export function getLastEvent() {
  try {
    return localStorage.getItem(LAST_EVENT_KEY) || "";
  } catch {
    return "";
  }
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
