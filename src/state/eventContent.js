/**
 * Per-event frontend content — hero, texts, story, schedule.
 *
 * Server truth lives in `events.content` (jsonb) and arrives via
 * GET /api/events/:id at boot. This module merges it over the built-in
 * defaults from config/couple.js, so the app renders instantly with stock
 * copy and re-renders once the event's own content lands (or never changes
 * in local-only mode).
 *
 * Same pattern as state/guest.js: a plain module store with a subscribe
 * hook, because non-React code (memory-card filenames) reads it too.
 * Components use `useEventContent()`.
 */

import { useSyncExternalStore } from "react";
import {
  COUPLE as DEFAULT_COUPLE,
  SCHEDULE as DEFAULT_SCHEDULE,
  DRESS_CODE as DEFAULT_DRESS_CODE,
  STORY as DEFAULT_STORY,
} from '@/config/couple.js';

const DEFAULTS = Object.freeze({
  /** "Rawad & Maya" — hero title, story lede. */
  coupleNames: DEFAULT_COUPLE.names,
  /** "R & M" — navbar, memory card, welcome eyebrow. */
  initials: DEFAULT_COUPLE.initials,
  /** Display string, host-formatted: "12 . 06 . 2026". */
  dateDisplay: DEFAULT_COUPLE.date,
  /** ISO date the schedule's "Now" indicator anchors to. */
  dateISO: DEFAULT_COUPLE.dateISO,
  hashtag: DEFAULT_COUPLE.hashtag,
  heroLede: "Capture a moment — it joins the shared gallery the instant you snap it.",
  /** Absolute or /public path; hero background. */
  heroImageUrl: "/hero.jpg",
  dressCode: DEFAULT_DRESS_CODE,
  schedule: DEFAULT_SCHEDULE,
  story: DEFAULT_STORY,
  /** From the events row, not content — filled in by setEventContent. */
  eventTitle: DEFAULT_COUPLE.names,
});

let current = DEFAULTS;
const listeners = new Set();

/** Derive display fields the content doc may omit. */
function withDerived(merged) {
  if (!merged.initials && merged.coupleNames) {
    merged.initials = merged.coupleNames
      .split(/\s*&\s*/)
      .map((n) => n.trim().charAt(0).toUpperCase())
      .filter(Boolean)
      .join(" & ");
  }
  return merged;
}

export function getEventContent() {
  return current;
}

/**
 * Merge a server event (GET /api/events/:id shape) over the defaults.
 * Empty/missing keys keep their default — an event with no content set
 * renders the stock experience.
 */
export function setEventContent(event) {
  const c = event?.content ?? {};
  const clean = Object.fromEntries(
    Object.entries(c).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
  );
  current = withDerived({
    ...DEFAULTS,
    eventTitle: event?.title ?? DEFAULTS.eventTitle,
    dateISO: event?.startsAt ? event.startsAt.slice(0, 10) : DEFAULTS.dateISO,
    coupleNames: event?.title ?? DEFAULTS.coupleNames,
    ...clean,
  });
  listeners.forEach((cb) => {
    try { cb(current); } catch { /* one bad subscriber can't break the rest */ }
  });
}

export function subscribeEventContent(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** ["Rawad", "Maya"] — hero renders the names on separate lines. */
export function splitCoupleNames(content = current) {
  const parts = content.coupleNames.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : [content.coupleNames, ""];
}

export function useEventContent() {
  return useSyncExternalStore(subscribeEventContent, getEventContent, getEventContent);
}
