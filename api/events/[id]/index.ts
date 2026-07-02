import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientIp, methodGuard, parseMultipart, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin } from "../../_lib/session.js";
import { validContent } from "../../_lib/validate.js";
import { resolveEvent } from "../../_lib/events.js";
import { signedUrlFor } from "../../_lib/media.js";
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
 * POST   /api/events/:id/cover — host hero upload (rewritten here on Hobby).
 */

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const HERO_BUCKET = "photos";

async function postCover(req: VercelRequest, res: VercelResponse, id: string) {
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");
  if (!rateLimit(res, `cover-up:${clientIp(req)}`, 20)) return;

  const ev = await resolveEvent(id);
  if (!ev) return sendError(res, "not_found");

  const body = await parseMultipart(req, COVER_MAX_BYTES).catch((err) => {
    sendError(res, err?.code === "file_too_large" ? "payload_too_large" : "invalid_request", err?.message);
    return null;
  });
  if (!body) return;

  const file = body.files.find((f) => f.field === "file") ?? body.files[0];
  if (!file?.buffer.length) return sendError(res, "invalid_request", "missing file");
  if (!COVER_MIMES.has(file.mime)) return sendError(res, "unsupported_media");

  const ext = COVER_EXT[file.mime];
  const storageKey = `${ev.id}/hero.${ext}`;
  const { error: upErr } = await admin().storage.from(HERO_BUCKET).upload(storageKey, file.buffer, {
    contentType: file.mime,
    upsert: true,
  });
  if (upErr) throw upErr;

  const url = await signedUrlFor(HERO_BUCKET, storageKey);
  if (!url) return sendError(res, "internal", "could not sign hero url");
  res.status(200).json({ url, storageKey });
}

/** Sign hero storage keys for the client; strip stale public URLs from DB. */
async function enrichContent(raw: Record<string, unknown> | null | undefined, slug: string) {
  const content = { ...(raw ?? {}) };
  const key = typeof content.heroStorageKey === "string" ? content.heroStorageKey.trim() : "";
  if (key) {
    content.heroImageUrl = `/api/events/${encodeURIComponent(slug)}/hero`;
  } else if (typeof content.heroImageUrl === "string" && content.heroImageUrl) {
    // Legacy URL without a storage key — only keep local stock paths.
    if (!content.heroImageUrl.startsWith("/")) delete content.heroImageUrl;
  }
  return content;
}

async function shape(data: any) {
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    coverPhotoId: data.cover_photo_id,
    content: await enrichContent(data.content ?? {}, data.slug),
  };
}

async function get(req: VercelRequest, res: VercelResponse, id: string) {
  const data = await resolveEvent(id);
  if (!data) return sendError(res, "not_found");
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  res.status(200).json(await shape(data));
}

const HERO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function getHero(res: VercelResponse, id: string) {
  const ev = await resolveEvent(id);
  if (!ev) return sendError(res, "not_found");
  const content = (ev.content ?? {}) as Record<string, unknown>;
  const key = typeof content.heroStorageKey === "string" ? content.heroStorageKey.trim() : "";
  if (!key) return sendError(res, "not_found");

  const { data, error } = await admin().storage.from(HERO_BUCKET).download(key);
  if (error || !data) return sendError(res, "not_found");

  const ext = key.split(".").pop()?.toLowerCase() ?? "jpg";
  res.setHeader("Content-Type", HERO_MIME[ext] ?? "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(await data.arrayBuffer()));
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
  res.status(200).json(await shape(data));
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
  try {
    const { error: cErr } = await admin().storage.from("photos").remove([
      `${ev.id}/hero.jpg`,
      `${ev.id}/hero.png`,
      `${ev.id}/hero.webp`,
    ]);
    if (cErr) throw cErr;
  } catch (err) {
    captureError(err, { where: "event delete: cover purge", eventId: ev.id });
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
  if (!methodGuard(req, res, "GET", "PATCH", "DELETE", "POST")) return;
  if (!rateLimit(res, `event-${req.method}:${clientIp(req)}`, req.method === "DELETE" ? 30 : 120)) return;
  const id = String(req.query.id ?? "");
  if (req.query.asset === "hero" && req.method === "GET") return getHero(res, id);
  if (req.method === "GET") return get(req, res, id);
  if (req.method === "DELETE") return del(req, res, id);
  if (req.method === "POST") return postCover(req, res, id);
  return patch(req, res, id);
});
