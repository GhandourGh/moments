import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { clientIp, methodGuard, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin, requireSession } from "../../_lib/session.js";
import { isSha256 } from "../../_lib/validate.js";
import { resolveEvent } from "../../_lib/events.js";
import { eventEnded, listMedia, parseListParams, resolveEventForSession } from "../../_lib/media.js";
import { withSentry } from "../../_lib/sentry.js";

/**
 * Videos deviate from the multipart shape in docs/api-contract.md on purpose:
 * Vercel functions cap request bodies at ~4.5 MB, and a 60 s clip is 30–100 MB.
 * So upload is two-step, direct to Supabase Storage:
 *
 *   POST /api/events/:id/videos { action:"init", hash, durationMs, width,
 *        height, mime, takenAt } → { videoId, uploadUrl, token, storageKey }
 *   client PUTs the blob to uploadUrl (Supabase signed upload URL)
 *   POST /api/events/:id/videos { action:"confirm", videoId, storageKey, ... }
 *        → { accepted:[videoId], skipped:[], total }
 *
 * GET keeps the contract shape (same as photos, + durationMs).
 */

const MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX_DURATION_MS = 60_000;

async function init(req: VercelRequest, res: VercelResponse, eventId: string, guestId: string) {
  const { hash, durationMs, mime } = (req.body ?? {}) as Record<string, unknown>;
  if (!isSha256(hash)) return sendError(res, "invalid_request", "hash (sha256) required");
  if (typeof mime !== "string" || !MIMES.has(mime)) return sendError(res, "unsupported_media");
  const dur = Number(durationMs);
  if (!isFinite(dur) || dur <= 0) return sendError(res, "invalid_request", "durationMs required");
  if (dur > MAX_DURATION_MS) return sendError(res, "duration_too_long");

  const db = admin();
  const { data: dupe } = await db.from("videos").select("id")
    .eq("event_id", eventId).eq("hash", (hash as string).toLowerCase()).maybeSingle();
  if (dupe) return res.status(200).json({ videoId: dupe.id, duplicate: true });

  const videoId = randomUUID();
  // Key is namespaced by guest so confirm can verify the caller owns the
  // upload — otherwise any same-event guest could confirm someone else's blob.
  const storageKey = `${eventId}/${guestId}/${videoId}.${EXT[mime]}`;
  const { data: signed, error } = await db.storage.from("videos").createSignedUploadUrl(storageKey);
  if (error) throw error;

  res.status(200).json({ videoId, storageKey, uploadUrl: signed.signedUrl, token: signed.token, duplicate: false });
}

async function confirm(req: VercelRequest, res: VercelResponse, eventId: string, guestId: string) {
  const { videoId, storageKey, hash, durationMs, width, height, mime, takenAt } =
    (req.body ?? {}) as Record<string, unknown>;
  // The key carries the guest namespace from init; a confirm for a key
  // outside the caller's own namespace is someone else's upload.
  if (typeof videoId !== "string" || typeof storageKey !== "string" || !storageKey.startsWith(`${eventId}/${guestId}/`)) {
    return sendError(res, "invalid_request");
  }
  if (!isSha256(hash)) return sendError(res, "invalid_request", "hash required");
  if (typeof mime !== "string" || !MIMES.has(mime)) return sendError(res, "unsupported_media");
  const dur = Number(durationMs);
  if (!isFinite(dur) || dur <= 0 || dur > MAX_DURATION_MS) return sendError(res, "duration_too_long");

  const db = admin();
  // The object must actually be there — confirm is not a promise, it's a receipt.
  const { data: obj, error: headErr } = await db.storage.from("videos").info(storageKey);
  if (headErr || !obj) return sendError(res, "not_found", "upload not found in storage");

  const { data: guest, error: gErr } = await db.from("guests")
    .select("first_name, last_name").eq("id", guestId).single();
  if (gErr) throw gErr;

  const takenAtRaw = Date.parse(String(takenAt ?? ""));
  const { error: insErr } = await db.from("videos").insert({
    id: videoId,
    event_id: eventId,
    guest_id: guestId,
    guest_first_name: guest.first_name,
    guest_last_name: guest.last_name,
    storage_key: storageKey,
    taken_at: new Date(isNaN(takenAtRaw) ? Date.now() : takenAtRaw).toISOString(),
    duration_ms: Math.round(dur),
    width: parseInt(String(width ?? "0"), 10) || 0,
    height: parseInt(String(height ?? "0"), 10) || 0,
    mime,
    hash: (hash as string).toLowerCase(),
    moderation_status: "pending",
  });

  const { count } = await db.from("videos").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).neq("moderation_status", "blocked");

  if (insErr) {
    if (insErr.code === "23505") {
      // Lost the (event_id, hash) race to a concurrent confirm — report the
      // id of the row that actually exists.
      const { data: existing } = await db.from("videos").select("id")
        .eq("event_id", eventId).eq("hash", (hash as string).toLowerCase()).maybeSingle();
      return res.status(200).json({ accepted: [], skipped: [existing?.id ?? videoId], total: count ?? 0 });
    }
    throw insErr;
  }
  res.status(200).json({ accepted: [videoId], skipped: [], total: count ?? 0 });
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST", "GET")) return;

  // Host dashboard access: a valid x-admin-passcode replaces the guest
  // session for the read path (same listing shape, no session-event bind).
  if (req.method === "GET" && isAdmin(req)) {
    if (!rateLimit(res, `videos-admin:${clientIp(req)}`, 30)) return;
    const ev = await resolveEvent(String(req.query.id ?? ""));
    if (!ev) return sendError(res, "not_found");
    return listMedia(res, "videos", "videos", ev.id, parseListParams(req), String(req.query.id ?? ""));
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const ev = await resolveEventForSession(res, String(req.query.id ?? ""), session);
  if (!ev) return;

  if (req.method === "GET") {
    if (!rateLimit(res, `videos-list:${session.guestId}`, 240)) return;
    return listMedia(res, "videos", "videos", ev.id, parseListParams(req), String(req.query.id ?? ""));
  }

  if (!rateLimit(res, `videos-up:${session.guestId}`, 10)) return;
  if (eventEnded(ev)) return sendError(res, "event_ended");
  const action = (req.body as Record<string, unknown> | undefined)?.action;
  if (action === "init") return init(req, res, ev.id, session.guestId);
  if (action === "confirm") return confirm(req, res, ev.id, session.guestId);
  return sendError(res, "invalid_request", "action must be init or confirm");
});
