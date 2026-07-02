/**
 * Neutral platform defaults for guest pages — NOT a specific couple.
 * Stock wedding demo copy lives in config/couple.js for offline dev only.
 */

export const DEFAULT_FEATURES = Object.freeze({
  /** "Tonight's flow" timeline on the home page. */
  schedule: true,
  /** /story page and nav tab. */
  story: true,
  /** Center initials in the top navbar. */
  navbarInitials: true,
  /** Scrolling name band under the hero. */
  scrollBand: true,
  /** Dress-code chip in the schedule header. */
  dressCode: true,
  /** Memory-card row under the capture strip. */
  memoryRow: true,
  /** Story link in navbar / bottom tab (independent of story page content). */
  storyNav: true,
});

export const PLATFORM_DEFAULTS = Object.freeze({
  coupleNames: "",
  initials: "",
  dateDisplay: "",
  dateISO: "",
  hashtag: "",
  heroLede: "Capture a moment — it joins the shared gallery the instant you snap it.",
  heroImageUrl: "",
  dressCode: "",
  schedule: [],
  story: [],
  pageTitle: "",
  storyTitle: "",
  storyLede: "",
  eventTitle: "",
  features: { ...DEFAULT_FEATURES },
});

export const FEATURE_FIELDS = [
  { key: "schedule", label: "Tonight's flow", hint: "schedule timeline on the home page" },
  { key: "scrollBand", label: "Scrolling name band", hint: "marquee under the hero" },
  { key: "dressCode", label: "Dress code chip", hint: "shown in the schedule header" },
  { key: "memoryRow", label: "Memory cards row", hint: "keepsake strip under captures" },
  { key: "navbarInitials", label: "Navbar initials", hint: "center mark in the top bar" },
  { key: "storyNav", label: "Story tab", hint: "Story page link in navigation" },
  { key: "story", label: "Story page content", hint: "when off, /story redirects home" },
];

export function mergeFeatures(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FEATURES };
  return { ...DEFAULT_FEATURES, ...raw };
}

/** Browser tab title from event content. */
export function pageTitleFromContent(content) {
  if (content.pageTitle?.trim()) return content.pageTitle.trim();
  const name = content.coupleNames?.trim() || content.eventTitle?.trim();
  if (name) return `${name} — Share the night`;
  return "Moments";
}
