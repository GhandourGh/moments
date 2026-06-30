/**
 * Seed gallery — real placeholder photos served from /public/seed/.
 * Pre-processed (max 1400 px, quality 78) so the gallery loads quickly.
 * Eight Pexels wedding photos — regenerate with `npm run compress-seed`.
 */

const FILES = Array.from({ length: 8 }, (_, i) =>
  `/seed/seed-${String(i + 1).padStart(2, "0")}.jpg`
);

// Spread the seed photos across the last ~90 minutes so the timestamp
// badges read as "during the event" instead of all-the-same epoch time.
const NOW = Date.now();
const MINUTE = 60_000;

export const SEED_SHOTS = FILES.map((url, i) => ({
  id: `seed-${i + 1}`,
  url,
  takenAt: NOW - (i * 9 + 4) * MINUTE,
  seed: true,
}));
