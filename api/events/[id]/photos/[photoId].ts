import { clientIp, methodGuard, rateLimit, sendError } from "../../../_lib/http.js";
import { admin } from "../../../_lib/supabase.js";
import { isAdmin } from "../../../_lib/session.js";
import { isUuid } from "../../../_lib/validate.js";
import { resolveEvent } from "../../../_lib/events.js";
import { captureError, withSentry } from "../../../_lib/sentry.js";

/**
 * DELETE /api/events/:id/photos/:photoId — host moderation (x-admin-passcode).
 *
 * Routing note: this lives in a `photos/` folder that is a sibling of
 * `photos.ts`. Vercel's /api file routing serves both without conflict —
 * `/api/events/:id/photos` hits the file, `/api/events/:id/photos/:photoId`
 * hits this dynamic segment.
 *
 * The photo must belong to the resolved event (else 404 — no cross-event
 * probing). Storage object goes first; face_embeddings and reactions cascade
 * off the row delete.
 */
export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "DELETE")) return;
  if (!rateLimit(res, `photo-delete:${clientIp(req)}`, 30)) return;
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");

  const ev = await resolveEvent(String(req.query.id ?? ""));
  if (!ev) return sendError(res, "not_found");

  const photoId = String(req.query.photoId ?? "");
  if (!isUuid(photoId)) return sendError(res, "not_found");

  const db = admin();
  const { data: photo, error } = await db
    .from("photos")
    .select("id, storage_key")
    .eq("id", photoId)
    .eq("event_id", ev.id)
    .maybeSingle();
  if (error) throw error;
  if (!photo) return sendError(res, "not_found");

  // Report storage failures but still drop the row — an orphaned object in a
  // private bucket beats a "deleted" photo that keeps showing in the gallery.
  const { error: rmErr } = await db.storage.from("photos").remove([photo.storage_key]);
  if (rmErr) captureError(rmErr, { where: "photo delete: storage remove", photoId, eventId: ev.id });

  const { error: delErr } = await db.from("photos").delete().eq("id", photoId);
  if (delErr) throw delErr;

  res.status(200).json({ ok: true });
});
