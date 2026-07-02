import { methodGuard, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/session.js";
import { resolveEventForSession } from "../../_lib/media.js";
import { withSentry } from "../../_lib/sentry.js";

/**
 * POST /api/events/:id/match — "find my photos".
 *
 * Deviation from docs/api-contract.md (multipart selfie): the client computes
 * the selfie's 128-dim descriptor on-device with the same face-api model used
 * at capture time, and sends JSON { embedding: number[128] }. The raw selfie
 * never leaves the phone and the match costs $0 — it's one pgvector ANN query
 * (moment.match_faces, migration 20260702000003).
 */

const THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82");

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const session = await requireSession(req, res);
  if (!session) return;
  if (!rateLimit(res, `match:${session.guestId}`, 5)) return;
  const ev = await resolveEventForSession(res, String(req.query.id ?? ""), session);
  if (!ev) return;

  const { embedding } = (req.body ?? {}) as { embedding?: unknown };
  if (!Array.isArray(embedding) || embedding.length !== 128 || !embedding.every((n) => typeof n === "number" && isFinite(n))) {
    return sendError(res, "no_face_detected", "embedding must be a 128-float face descriptor");
  }

  const { data, error } = await admin().rpc("match_faces", {
    p_event_id: ev.id,
    p_embedding: JSON.stringify(embedding),
    p_threshold: THRESHOLD,
    p_limit: 100,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ photo_id: string; similarity: number }>;
  res.status(200).json({
    photoIds: rows.map((r) => r.photo_id),
    matched: rows.length,
    threshold: THRESHOLD,
  });
});
