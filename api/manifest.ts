import { clientIp, methodGuard, rateLimit, sendError } from "./_lib/http.js";
import { resolveEvent } from "./_lib/events.js";
import { withSentry } from "./_lib/sentry.js";

/**
 * GET /api/manifest?event=<slug|uuid> — per-event web app manifest so an
 * installed PWA opens straight into its event (/e/<slug>) with the event's
 * name. Mirrors the static public/manifest.webmanifest (icons, colors,
 * display); only identity fields are dynamic.
 */

/** <=12 chars for the launcher label; whole title, first word, or a cut. */
function shortName(title: string): string {
  const t = title.trim();
  if (!t) return "Moments";
  if (t.length <= 12) return t;
  const first = t.split(/\s+/)[0];
  if (first.length >= 2 && first.length <= 12) return first;
  return t.slice(0, 12).trim() || "Moments";
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;
  if (!rateLimit(res, `manifest:${clientIp(req)}`, 120)) return;

  const raw = String(req.query.event ?? "");
  if (!raw) return sendError(res, "invalid_event", "event query param (slug or uuid) required");

  const ev = await resolveEvent(raw);
  if (!ev) return sendError(res, "not_found");

  const content = (ev.content ?? {}) as Record<string, unknown>;
  const coupleNames = typeof content.coupleNames === "string" ? content.coupleNames.trim() : "";
  const pageTitle = typeof content.pageTitle === "string" ? content.pageTitle.trim() : "";
  const name = pageTitle.split("—")[0].trim() || ev.title.trim() || coupleNames || "Moments";

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    id: `/e/${ev.slug}`,
    name,
    short_name: shortName(name),
    description: "The shared photo gallery for our night together.",
    start_url: `/e/${ev.slug}`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf6ee",
    theme_color: "#fbf6ee",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
});
