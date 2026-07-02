import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientIp, methodGuard, rateLimit, sendError } from "../_lib/http.js";
import { admin } from "../_lib/supabase.js";
import { isAdmin } from "../_lib/session.js";
import { isSlug, validContent } from "../_lib/validate.js";
import { withSentry } from "../_lib/sentry.js";

/**
 * Host/admin surface — protected by the ADMIN_PASSCODE header, not a guest
 * session. Hosts are trusted operators, not guests (see AskUserQuestion
 * decision: simple passcode, no accounts).
 *
 * POST /api/events — create an event.  { title, slug?, startsAt, endsAt }
 * GET  /api/events — list events (newest first) with guest/photo/video counts.
 */

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `event-${Date.now().toString(36)}`;
}

async function post(req: VercelRequest, res: VercelResponse) {
  const { title, slug, startsAt, endsAt, content } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    return sendError(res, "invalid_request", "title is required (1-120 chars)");
  }
  const starts = new Date(String(startsAt ?? ""));
  const ends = new Date(String(endsAt ?? ""));
  if (isNaN(starts.getTime()) || isNaN(ends.getTime()) || ends <= starts) {
    return sendError(res, "invalid_request", "startsAt/endsAt must be valid ISO dates with endsAt after startsAt");
  }
  let finalSlug = typeof slug === "string" && slug ? slug : slugify(title.trim());
  if (!isSlug(finalSlug)) return sendError(res, "invalid_request", "slug must be lowercase letters, digits, hyphens");
  if (content !== undefined && !validContent(content)) {
    return sendError(res, "invalid_request", "content must be an object under 32KB");
  }

  const db = admin();
  const { data, error } = await db
    .from("events")
    .insert({
      title: title.trim(),
      slug: finalSlug,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      content: content ?? {},
    })
    .select("id, slug, title, starts_at, ends_at, content")
    .single();
  if (error) {
    if (error.code === "23505") return sendError(res, "conflict", "slug already exists");
    throw error;
  }
  res.status(200).json({
    id: data.id,
    slug: data.slug,
    title: data.title,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    content: data.content ?? {},
  });
}

async function list(_req: VercelRequest, res: VercelResponse) {
  const db = admin();
  const { data, error } = await db
    .from("events")
    // photos has two paths to events (event_id FK + cover_photo_id back-ref);
    // disambiguate or PostgREST errors out.
    .select("id, slug, title, starts_at, ends_at, created_at, guests(count), photos!photos_event_id_fkey(count), videos(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.status(200).json({
    events: (data ?? []).map((e: any) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      createdAt: e.created_at,
      guests: e.guests?.[0]?.count ?? 0,
      photos: e.photos?.[0]?.count ?? 0,
      videos: e.videos?.[0]?.count ?? 0,
    })),
  });
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST", "GET")) return;
  if (!rateLimit(res, `events-admin:${clientIp(req)}`, 30)) return;
  if (!isAdmin(req)) return sendError(res, "unauthenticated", "bad or missing x-admin-passcode");
  if (req.method === "POST") return post(req, res);
  return list(req, res);
});
