import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientIp, methodGuard, rateLimit, sendError } from "../../_lib/http.js";
import { admin } from "../../_lib/supabase.js";
import { isAdmin } from "../../_lib/session.js";
import { isValidName, isUuid } from "../../_lib/validate.js";
import { resolveEvent } from "../../_lib/events.js";
import { captureError, withSentry } from "../../_lib/sentry.js";

/**
 * GET    /api/events/:id/guests — list guests with photo/video counts (admin).
 * PATCH  /api/events/:id/guests/:guestId — rename a guest (admin).
 * DELETE /api/events/:id/guests/:guestId — remove guest + their media (admin).
 */

async function listGuests(_req: VercelRequest, res: VercelResponse, eventId: string) {
  const db = admin();
  const { data, error } = await db
    .from("guests")
    .select("id, first_name, last_name, created_at, updated_at, photos(count), videos(count)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  res.status(200).json({
    guests: (data ?? []).map((g: any) => ({
      id: g.id,
      firstName: g.first_name,
      lastName: g.last_name,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      photos: g.photos?.[0]?.count ?? 0,
      videos: g.videos?.[0]?.count ?? 0,
    })),
    total: data?.length ?? 0,
  });
}

async function patchGuest(req: VercelRequest, res: VercelResponse, eventId: string, guestId: string) {
  const { firstName, lastName } = (req.body ?? {}) as Record<string, unknown>;
  if (!isValidName(firstName) || !isValidName(lastName)) {
    return sendError(res, "invalid_name");
  }

  const db = admin();
  const { data, error } = await db
    .from("guests")
    .update({
      first_name: (firstName as string).trim(),
      last_name: (lastName as string).trim(),
    })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select("id, first_name, last_name, created_at, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return sendError(res, "not_found");

  res.status(200).json({
    guest: {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

async function deleteGuest(_req: VercelRequest, res: VercelResponse, eventId: string, guestId: string) {
  const db = admin();

  const { data: guest, error: gErr } = await db
    .from("guests")
    .select("id")
    .eq("id", guestId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!guest) return sendError(res, "not_found");

  const { data: photos, error: pErr } = await db
    .from("photos")
    .select("id, storage_key")
    .eq("guest_id", guestId)
    .eq("event_id", eventId);
  if (pErr) throw pErr;

  const { data: videos, error: vErr } = await db
    .from("videos")
    .select("id, storage_key")
    .eq("guest_id", guestId)
    .eq("event_id", eventId);
  if (vErr) throw vErr;

  const photoKeys = (photos ?? []).map((p) => p.storage_key).filter(Boolean);
  const videoKeys = (videos ?? []).map((v) => v.storage_key).filter(Boolean);

  if (photoKeys.length) {
    const { error: rmErr } = await db.storage.from("photos").remove(photoKeys);
    if (rmErr) captureError(rmErr, { where: "guest delete: photos storage", guestId, eventId });
  }
  if (videoKeys.length) {
    const { error: rmErr } = await db.storage.from("videos").remove(videoKeys);
    if (rmErr) captureError(rmErr, { where: "guest delete: videos storage", guestId, eventId });
  }

  // photos/videos.guest_id are ON DELETE RESTRICT — drop media rows first.
  if (photos?.length) {
    const { error: delPErr } = await db.from("photos").delete().eq("guest_id", guestId).eq("event_id", eventId);
    if (delPErr) throw delPErr;
  }
  if (videos?.length) {
    const { error: delVErr } = await db.from("videos").delete().eq("guest_id", guestId).eq("event_id", eventId);
    if (delVErr) throw delVErr;
  }

  const { error: delGErr } = await db.from("guests").delete().eq("id", guestId).eq("event_id", eventId);
  if (delGErr) throw delGErr;

  res.status(200).json({
    ok: true,
    deletedPhotos: photos?.length ?? 0,
    deletedVideos: videos?.length ?? 0,
  });
}

export default withSentry(async (req, res) => {
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");

  const guestId = typeof req.query.guestId === "string" ? req.query.guestId : "";
  const eventIdOrSlug = String(req.query.id ?? "");
  const ev = await resolveEvent(eventIdOrSlug);
  if (!ev) return sendError(res, "not_found");

  if (req.method === "DELETE" && guestId) {
    if (!isUuid(guestId)) return sendError(res, "not_found");
    if (!rateLimit(res, `guests-del:${clientIp(req)}`, 30)) return;
    return deleteGuest(req, res, ev.id, guestId);
  }

  if (req.method === "PATCH" && guestId) {
    if (!isUuid(guestId)) return sendError(res, "not_found");
    if (!rateLimit(res, `guests-patch:${clientIp(req)}`, 60)) return;
    return patchGuest(req, res, ev.id, guestId);
  }

  if (!methodGuard(req, res, "GET")) return;
  if (!rateLimit(res, `guests-list:${clientIp(req)}`, 60)) return;
  return listGuests(req, res, ev.id);
});
