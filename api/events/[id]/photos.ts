import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomUUID } from "node:crypto";
import { clientIp, methodGuard, parseMultipart, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin, requireSession } from "../../_lib/session.js";
import { isSha256 } from "../../_lib/validate.js";
import { resolveEvent } from "../../_lib/events.js";
import { eventEnded, listMedia, parseFaces, parseListParams, resolveEventForSession, signedUrlFor } from "../../_lib/media.js";
import { moderateImage, moderationEnabled } from "../../_lib/ai.js";
import { captureError, withSentry } from "../../_lib/sentry.js";

/**
 * POST /api/events/:id/photos — multipart photo upload (docs/api-contract.md).
 *   fields: file, takenAt, hash (sha256), width, height,
 *           faces (JSON array of 128-dim on-device face descriptors)
 * GET  /api/events/:id/photos — gallery hydration with since/limit/cursor.
 *
 * Moderation runs server-side inside the upload (one Haiku call per photo)
 * rather than trusting the client's preflight. Fail-open: if the provider is
 * down the photo lands as `pending` — the party can't wait on us.
 */

// Vercel rejects request bodies over ~4.5 MB before the function even runs,
// so anything above 4 MB would die at the platform edge with an opaque error.
const MAX_BYTES = 4 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const FACE_MODEL = "faceapi-recognition-128d";

async function post(req: VercelRequest, res: VercelResponse, eventId: string, guestId: string) {
  const contentLength = parseInt(String(req.headers["content-length"] ?? "0"), 10);
  if (contentLength > MAX_BYTES) {
    return sendError(res, "payload_too_large", `photo upload must be under ${MAX_BYTES / (1024 * 1024)}MB`);
  }
  const body = await parseMultipart(req, MAX_BYTES).catch((err) => {
    sendError(res, err?.code === "file_too_large" ? "payload_too_large" : "invalid_request", err?.message);
    return null;
  });
  if (!body) return;

  const file = body.files.find((f) => f.field === "file") ?? body.files[0];
  if (!file || !file.buffer.length) return sendError(res, "invalid_request", "missing file");
  if (!MIMES.has(file.mime)) return sendError(res, "unsupported_media");

  const hash = createHash("sha256").update(file.buffer).digest("hex");
  if (body.fields.hash && isSha256(body.fields.hash) && body.fields.hash.toLowerCase() !== hash) {
    return sendError(res, "invalid_request", "hash mismatch");
  }

  const db = admin();
  const total = async () => {
    const { count } = await db.from("photos").select("id", { count: "exact", head: true })
      .eq("event_id", eventId).neq("moderation_status", "blocked");
    return count ?? 0;
  };

  // Dedupe on (event_id, hash) — same shot re-sent by the retry queue.
  const { data: dupe } = await db.from("photos").select("id, storage_key")
    .eq("event_id", eventId).eq("hash", hash).maybeSingle();
  if (dupe) {
    const url = await signedUrlFor("photos", dupe.storage_key);
    return res.status(200).json({ accepted: [], skipped: [dupe.id], total: await total(), url });
  }

  // Moderate before anything is stored. Blocked photos never touch storage.
  let status = "pending";
  if (moderationEnabled()) {
    const verdict = await moderateImage(file.buffer, file.mime);
    if (verdict) {
      if (!verdict.allowed) return sendError(res, "moderation_blocked", verdict.reasons.join(", ") || "blocked");
      status = "allowed";
    }
  }

  const { data: guest, error: gErr } = await db.from("guests")
    .select("first_name, last_name").eq("id", guestId).single();
  if (gErr) throw gErr;

  const photoId = randomUUID();
  const storageKey = `${eventId}/${photoId}.${EXT[file.mime]}`;
  const { error: upErr } = await db.storage.from("photos")
    .upload(storageKey, file.buffer, { contentType: file.mime });
  if (upErr) throw upErr;

  const takenAtRaw = Date.parse(body.fields.takenAt ?? "");
  const { error: insErr } = await db.from("photos").insert({
    id: photoId,
    event_id: eventId,
    guest_id: guestId,
    guest_first_name: guest.first_name,
    guest_last_name: guest.last_name,
    storage_key: storageKey,
    taken_at: new Date(isNaN(takenAtRaw) ? Date.now() : takenAtRaw).toISOString(),
    width: parseInt(body.fields.width ?? "0", 10) || 0,
    height: parseInt(body.fields.height ?? "0", 10) || 0,
    mime: file.mime,
    hash,
    moderation_status: status,
  });
  if (insErr) {
    await db.storage.from("photos").remove([storageKey]).catch(() => {});
    if (insErr.code === "23505") {
      // A concurrent upload of the same photo won the (event_id, hash) race —
      // return the row that actually exists, not the uuid we never inserted.
      const { data: existing } = await db.from("photos").select("id, storage_key")
        .eq("event_id", eventId).eq("hash", hash).maybeSingle();
      const url = existing ? await signedUrlFor("photos", existing.storage_key) : null;
      return res.status(200).json({ accepted: [], skipped: [existing?.id ?? photoId], total: await total(), url });
    }
    throw insErr;
  }

  const faces = parseFaces(body.fields.faces);
  if (faces.length) {
    const { error: faceErr } = await db.from("face_embeddings").insert(
      faces.map((embedding) => ({ photo_id: photoId, embedding: JSON.stringify(embedding), model: FACE_MODEL }))
    );
    // Losing face-match data must not fail an otherwise-successful upload.
    if (faceErr) captureError(faceErr, { where: "face_embeddings insert", photoId, eventId });
  }

  const url = await signedUrlFor("photos", storageKey);
  res.status(200).json({ accepted: [photoId], skipped: [], total: await total(), url });
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST", "GET")) return;

  // Host dashboard access: a valid x-admin-passcode replaces the guest
  // session for the read path (same listing shape, no session-event bind).
  if (req.method === "GET" && isAdmin(req)) {
    if (!rateLimit(res, `photos-admin:${clientIp(req)}`, 30)) return;
    const ev = await resolveEvent(String(req.query.id ?? ""));
    if (!ev) return sendError(res, "not_found");
    return listMedia(res, "photos", "photos", ev.id, parseListParams(req));
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const ev = await resolveEventForSession(res, String(req.query.id ?? ""), session);
  if (!ev) return;

  if (req.method === "GET") {
    if (!rateLimit(res, `photos-list:${session.guestId}`, 240)) return;
    return listMedia(res, "photos", "photos", ev.id, parseListParams(req));
  }

  if (!rateLimit(res, `photos-up:${session.guestId}`, 30)) return;
  if (eventEnded(ev)) return sendError(res, "event_ended");
  return post(req, res, ev.id, session.guestId);
});
