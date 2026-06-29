// Single source of truth for the couple's identity. Edit per event.
export const COUPLE = {
  initials: "R & M",
  names: "Rawad & Maya",
  date: "12 . 06 . 2026",
  hashtag: "#RawadAndMaya",
};

/** First names split from `COUPLE.names` — e.g. ["Rawad", "Maya"]. */
export const COUPLE_NAMES = COUPLE.names.split(" & ");

// The night's schedule. Times are display strings — no parsing.
export const SCHEDULE = [
  { time: "4:00 PM", title: "Ceremony",   detail: "Garden terrace · seats from 3:40" },
  { time: "5:30 PM", title: "Cocktails",  detail: "On the upper lawn" },
  { time: "7:00 PM", title: "Dinner",     detail: "Toasts at 8:15" },
  { time: "9:00 PM", title: "First dance",detail: "Floor opens after" },
  { time: "11:30 PM", title: "Send-off",  detail: "Sparklers at the gate" },
];

export const DRESS_CODE = "Garden formal · earth tones";

/** App + host contact — shown in the site footer. */
export const APP = {
  name: "FaceGather",
  about:
    "A shared photo gallery for wedding guests. Capture moments, browse everyone's shots, and download keepsakes — all in one place.",
  host: "Origin",
};

export const CONTACT = {
  whatsapp: "96176088440",
  /** Opens WhatsApp app directly — avoids api.whatsapp.com redirect. */
  whatsappNative: "whatsapp://send?phone=96176088440",
  /** Desktop / fallback when the app is not installed. */
  whatsappWeb: "https://web.whatsapp.com/send?phone=96176088440",
  instagramUsername: "origin.lb",
  /** Opens Instagram app directly on mobile. */
  instagramNative: "instagram://user?username=origin.lb",
  /** Web profile — no www to reduce redirect hops. */
  instagramWeb: "https://instagram.com/origin.lb/",
};

// Pull-quote-style mini chapters for /story. Free to rewrite.
// `image` is a path under /public; `alt` is used by screen readers.
export const STORY = [
  {
    title: "How we met",
    body: "A friend's birthday at a little place off Mar Mikhael. Rawad was DJing for free drinks and Maya was the only one who asked what he was actually playing. We have been arguing about music ever since.",
    pull: "We have been arguing about music ever since.",
    image: "/seed/seed-01.jpg",
    alt: "A candlelit evening, the night Rawad and Maya first met.",
  },
  {
    title: "Why this venue",
    body: "Villa des Oliviers belonged to Maya's grandparents. We spent our first weekend together here, walked the olive grove at dawn, and never quite left. Tonight feels like coming home.",
    pull: "Tonight feels like coming home.",
    image: "/seed/seed-04.jpg",
    alt: "The olive grove at Villa des Oliviers at dawn.",
  },
  {
    title: "The hashtag",
    body: "Tag your shots — or skip the tag and just take a photo here. Every frame guests capture inside the app lands automatically in the shared gallery. We will keep them forever.",
    pull: "Every frame lands in the shared gallery, automatically.",
    image: "/seed/seed-07.jpg",
    alt: "Guests with cameras during a wedding reception.",
  },
];
