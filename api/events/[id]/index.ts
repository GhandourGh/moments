import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientIp, methodGuard, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin } from "../../_lib/session.js";
import { validContent } from "../../_lib/validate.js";
import { resolveEvent } from "../../_lib/events.js";
import { captureError, withSentry } from "../../_lib/sentry.js";

/**
 * GET    /api/events/:id — public event metadata + per-event frontend content
 *        (hero, texts, story…). `:id` accepts uuid or slug.
 * PATCH  /api/events/:id — host edit (x-admin-passcode): title, dates, content.
 *        Content replaces wholesale — the /host editor always sends the full
 *        document, so no merge semantics to get wrong.
 * DELETE /api/events/:id — host delete (x-admin-passcode): purges storage
 *        objects for the event, then the row (FK cascades take guests,
 *        photos, videos, face_embeddings, reactions).
 */

function shape(data: any) {
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    coverPhotoId: data.cover_photo_id,
    content: data.content ?? {},
  };
}

async function get(req: VercelRequest, res: VercelResponse, id: string) {
  const data = await resolveEvent(id);
  if (!data) return sendError(res, "not_found");
  res.status(200).json(shape(data));
}

async function patch(req: VercelRequest, res: VercelResponse, id: string) {
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");

  const { title, startsAt, endsAt, content } = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return sendError(res, "invalid_request", "title must be 1-120 chars");
    }
    update.title = title.trim();
  }
  if (startsAt !== undefined) {
    const d = new Date(String(startsAt));
    if (isNaN(d.getTime())) return sendError(res, "invalid_request", "startsAt must be ISO");
    update.starts_at = d.toISOString();
  }
  if (endsAt !== undefined) {
    const d = new Date(String(endsAt));
    if (isNaN(d.getTime())) return sendError(res, "invalid_request", "endsAt must be ISO");
    update.ends_at = d.toISOString();
  }
  if (content !== undefined) {
    if (!validContent(content)) return sendError(res, "invalid_request", "content must be an object under 32KB");
    update.content = content;
  }
  if (!Object.keys(update).length) return sendError(res, "invalid_request", "nothing to update");

  const ev = await resolveEvent(id);
  if (!ev) return sendError(res, "not_found");

  const { data, error } = await admin()
    .from("events")
    .update(update)
    .eq("id", ev.id)
    .select("id, slug, title, starts_at, ends_at, cover_photo_id, content")
    .maybeSingle();
  if (error) throw error;
  if (!data) return sendError(res, "not_found");
  res.status(200).json(shape(data));
}

/**
 * Recursively collect every object key under `prefix` in `bucket` and remove
 * them in batches. Video keys are nested one level deeper than photos
 * ({eventId}/{guestId}/{videoId}.ext), so a flat list isn't enough — Supabase
 * returns folders as entries with a null id, and we walk into them.
 */
async function purgeStoragePrefix(bucket: "photos" | "videos", prefix: string): Promise<number> {
  const db = admin();
  const keys: string[] = [];
  const PAGE = 1000;

  async function walk(dir: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.storage.from(bucket).list(dir, { limit: PAGE, offset });
      if (error) throw error;
      if (!data?.length) return;
      for (const entry of data) {
        const path = `${dir}/${entry.name}`;
        if (entry.id === null) await walk(path);
        else keys.push(path);
      }
      if (data.length < PAGE) return;
      offset += data.length;
    }
  }

  await walk(prefix);

  let removed = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const { error } = await db.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += batch.length;
  }
  return removed;
}

async function del(req: VercelRequest, res: VercelResponse, id: string) {
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");

  const ev = await resolveEvent(id);
  if (!ev) return sendError(res, "not_found");

  // Purge storage first — the DB row (and its cascades) only goes once we've
  // at least attempted removal. Storage failures are reported, not fatal:
  // orphaned objects in a private bucket beat a half-deleted event.
  let deletedPhotos = 0;
  let deletedVideos = 0;
  try {
    deletedPhotos = await purgeStoragePrefix("photos", ev.id);
  } catch (err) {
    captureError(err, { where: "event delete: photos purge", eventId: ev.id });
  }
  try {
    deletedVideos = await purgeStoragePrefix("videos", ev.id);
  } catch (err) {
    captureError(err, { where: "event delete: videos purge", eventId: ev.id });
  }

  // photos/videos.guest_id are ON DELETE RESTRICT, so the events→guests
  // cascade can trip over still-existing media rows depending on trigger
  // order. Drop the media rows first (face_embeddings + reactions cascade
  // off them), then the event, whose cascade takes the guests.
  const db = admin();
  const { error: pErr } = await db.from("photos").delete().eq("event_id", ev.id);
  if (pErr) throw pErr;
  const { error: vErr } = await db.from("videos").delete().eq("event_id", ev.id);
  if (vErr) throw vErr;
  const { error } = await db.from("events").delete().eq("id", ev.id);
  if (error) throw error;

  res.status(200).json({ ok: true, deletedPhotos, deletedVideos });
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "GET", "PATCH", "DELETE")) return;
  if (!rateLimit(res, `event-${req.method}:${clientIp(req)}`, req.method === "DELETE" ? 30 : 120)) return;
  const id = String(req.query.id ?? "");
  if (req.method === "GET") return get(req, res, id);
  if (req.method === "DELETE") return del(req, res, id);
  return patch(req, res, id);
});
