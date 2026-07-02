import type { VercelRequest, VercelResponse } from "@vercel/node";
import { methodGuard, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/session.js";
import { resolveEventForSession } from "../../_lib/media.js";
import { captureError, withSentry } from "../../_lib/sentry.js";

/**
 * POST /api/events/:id/match — "find my photos" ({ embedding: number[128] }).
 * POST /api/events/:id/embeddings — on-demand face indexing from /me
 *   ({ items: [{ photoId, embeddings }] }). Rewritten to this handler on Hobby.
 */

const THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82");
const FACE_MODEL = "faceapi-recognition-128d";

type EmbedItem = { photoId?: unknown; embeddings?: unknown };

function parseEmbedItems(body: unknown): Array<{ photoId: string; embeddings: number[][] }> {
  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ photoId: string; embeddings: number[][] }> = [];
  for (const item of raw as EmbedItem[]) {
    if (typeof item?.photoId !== "string" || !item.photoId) continue;
    const embeddings = Array.isArray(item.embeddings)
      ? item.embeddings.filter(
          (f) => Array.isArray(f) && f.length === 128 && f.every((n) => typeof n === "number" && isFinite(n))
        ).slice(0, 20)
      : [];
    if (!embeddings.length) continue;
    out.push({ photoId: item.photoId, embeddings });
  }
  return out.slice(0, 50);
}

async function postEmbeddings(
  req: VercelRequest,
  res: VercelResponse,
  ev: { id: string },
  session: { guestId: string }
) {
  if (!rateLimit(res, `embed:${session.guestId}`, 20)) return;
  const items = parseEmbedItems(req.body);
  if (!items.length) return sendError(res, "invalid_request", "items must include photoId + embeddings");

  const db = admin();
  let indexed = 0;

  for (const { photoId, embeddings } of items) {
    const { data: photo, error: pErr } = await db.from("photos")
      .select("id")
      .eq("id", photoId)
      .eq("event_id", ev.id)
      .neq("moderation_status", "blocked")
      .maybeSingle();
    if (pErr) throw pErr;
    if (!photo) continue;

    const { count, error: cErr } = await db.from("face_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("photo_id", photoId);
    if (cErr) throw cErr;
    if ((count ?? 0) > 0) continue;

    const { error: faceErr } = await db.from("face_embeddings").insert(
      embeddings.map((embedding) => ({
        photo_id: photoId,
        embedding: JSON.stringify(embedding),
        model: FACE_MODEL,
      }))
    );
    if (faceErr) {
      captureError(faceErr, { where: "embeddings insert", photoId, eventId: ev.id });
      continue;
    }
    indexed += 1;
  }

  res.status(200).json({ indexed, received: items.length });
}

async function postMatch(
  req: VercelRequest,
  res: VercelResponse,
  ev: { id: string },
  session: { guestId: string }
) {
  if (!rateLimit(res, `match:${session.guestId}`, 5)) return;
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
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const session = await requireSession(req, res);
  if (!session) return;
  const ev = await resolveEventForSession(res, String(req.query.id ?? ""), session);
  if (!ev) return;

  const body = req.body ?? {};
  if (Array.isArray((body as { items?: unknown }).items)) {
    return postEmbeddings(req, res, ev, session);
  }
  return postMatch(req, res, ev, session);
});
