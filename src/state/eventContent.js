/**
 * Per-event frontend content — hero, texts, story, schedule, feature toggles.
 *
 * Server truth lives in `events.content` (jsonb) and arrives via
 * GET /api/events/:id at boot. Before load, state is neutral/empty so
 * events never flash another couple's stock copy.
 */

import { useSyncExternalStore } from "react";
import {
  COUPLE as STOCK_COUPLE,
  SCHEDULE as STOCK_SCHEDULE,
  DRESS_CODE as STOCK_DRESS_CODE,
  STORY as STOCK_STORY,
} from '@/config/couple.js';
import {
  DEFAULT_FEATURES,
  PLATFORM_DEFAULTS,
  mergeFeatures,
  pageTitleFromContent,
} from '@/config/eventDefaults.js';
import { hasBackend } from '@/services/api/index.js';

/** Offline / local dev without an event API — show the stock wedding demo. */
const STOCK_DEFAULTS = Object.freeze({
  ...PLATFORM_DEFAULTS,
  coupleNames: STOCK_COUPLE.names,
  initials: STOCK_COUPLE.initials,
  dateDisplay: STOCK_COUPLE.date,
  dateISO: STOCK_COUPLE.dateISO,
  hashtag: STOCK_COUPLE.hashtag,
  dressCode: STOCK_DRESS_CODE,
  schedule: STOCK_SCHEDULE,
  story: STOCK_STORY,
  eventTitle: STOCK_COUPLE.names,
  pageTitle: `${STOCK_COUPLE.names} — Share the night`,
});

function blankState() {
  return {
    ...PLATFORM_DEFAULTS,
    features: { ...DEFAULT_FEATURES },
    loaded: false,
    heroImageUrl: "",
  };
}

let current = blankState();
const listeners = new Set();

/** Derive display fields the content doc may omit. */
function withDerived(merged) {
  if (!merged.initials?.trim() && merged.coupleNames) {
    merged.initials = merged.coupleNames
      .split(/\s*&\s*/)
      .map((n) => n.trim().charAt(0).toUpperCase())
      .filter(Boolean)
      .join(" & ");
  }
  merged.features = mergeFeatures(merged.features);
  return merged;
}

export function getEventContent() {
  return current;
}

export function getPageTitle(content = current) {
  return pageTitleFromContent(content);
}

/** Reset while a new event slug loads (prevents hero.jpg / stock-name flash). */
export function resetEventContent() {
  current = blankState();
  listeners.forEach((cb) => {
    try { cb(current); } catch { /* one bad subscriber can't break the rest */ }
  });
}

/**
 * Merge a server event (GET /api/events/:id shape) over neutral defaults.
 * Empty content → blank event (title from events.title only).
 */
export function setEventContent(event) {
  const c = event?.content ?? {};
  const hasHero = Boolean(
    (typeof c.heroStorageKey === "string" && c.heroStorageKey.trim())
    || (typeof c.heroImageUrl === "string" && c.heroImageUrl.trim()),
  );

  const coupleNames = (
    (typeof c.coupleNames === "string" && c.coupleNames.trim())
    || event?.title?.trim()
    || ""
  );

  current = withDerived({
    ...PLATFORM_DEFAULTS,
    loaded: true,
    eventTitle: event?.title?.trim() ?? "",
    dateISO: event?.startsAt ? event.startsAt.slice(0, 10) : "",
    coupleNames,
    initials: typeof c.initials === "string" ? c.initials.trim() : "",
    dateDisplay: typeof c.dateDisplay === "string" ? c.dateDisplay.trim() : "",
    hashtag: typeof c.hashtag === "string" ? c.hashtag.trim() : "",
    heroLede: typeof c.heroLede === "string" && c.heroLede.trim()
      ? c.heroLede.trim()
      : PLATFORM_DEFAULTS.heroLede,
    pageTitle: typeof c.pageTitle === "string" ? c.pageTitle.trim() : "",
    storyTitle: typeof c.storyTitle === "string" ? c.storyTitle.trim() : "",
    storyLede: typeof c.storyLede === "string" ? c.storyLede.trim() : "",
    dressCode: typeof c.dressCode === "string" ? c.dressCode.trim() : "",
    schedule: Array.isArray(c.schedule) ? c.schedule : [],
    story: Array.isArray(c.story) ? c.story : [],
    features: mergeFeatures(c.features),
    ...(hasHero && c.heroImageUrl ? { heroImageUrl: c.heroImageUrl } : {}),
    ...(hasHero && c.heroStorageKey ? { heroStorageKey: c.heroStorageKey } : {}),
    ...(!hasHero ? { heroImageUrl: "", heroStorageKey: "" } : {}),
  });

  listeners.forEach((cb) => {
    try { cb(current); } catch { /* one bad subscriber can't break the rest */ }
  });
}

/** Local-only mode with no event API — stock wedding demo from couple.js. */
export function applyStockDemoContent() {
  if (hasBackend()) return;
  current = withDerived({ ...STOCK_DEFAULTS, loaded: true });
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
