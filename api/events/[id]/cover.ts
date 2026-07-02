import { methodGuard, parseMultipart, rateLimit, sendError, clientIp } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin } from "../../_lib/session.js";
import { resolveEvent } from "../../_lib/events.js";
import { withSentry } from "../../_lib/sentry.js";

/**
 * POST /api/events/:id/cover — host hero image upload (x-admin-passcode).
 * Stores a public object at covers/{eventId}/hero.{ext} and returns its URL.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const BUCKET = "covers";

function publicCoverUrl(eventId: string, ext: string): string {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${eventId}/hero.${ext}`;
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  if (!rateLimit(res, `cover-up:${clientIp(req)}`, 20)) return;
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");

  const ev = await resolveEvent(String(req.query.id ?? ""));
  if (!ev) return sendError(res, "not_found");

  const body = await parseMultipart(req, MAX_BYTES).catch((err) => {
    sendError(res, err?.code === "file_too_large" ? "payload_too_large" : "invalid_request", err?.message);
    return null;
  });
  if (!body) return;

  const file = body.files.find((f) => f.field === "file") ?? body.files[0];
  if (!file?.buffer.length) return sendError(res, "invalid_request", "missing file");
  if (!MIMES.has(file.mime)) return sendError(res, "unsupported_media");

  const ext = EXT[file.mime];
  const storageKey = `${ev.id}/hero.${ext}`;
  const { error: upErr } = await admin().storage.from(BUCKET).upload(storageKey, file.buffer, {
    contentType: file.mime,
    upsert: true,
  });
  if (upErr) throw upErr;

  res.status(200).json({ url: publicCoverUrl(ev.id, ext) });
});
