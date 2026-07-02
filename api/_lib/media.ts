import type { VercelRequest, VercelResponse } from "@vercel/node";
import { admin } from "./supabase.js";
import { sendError } from "./http.js";
import { resolveEvent, type EventRecord } from "./events.js";
import type { Session } from "./session.js";

/** Shared read-side + helpers for photos and videos endpoints. */

export type EventRow = Pick<EventRecord, "id" | "slug" | "ends_at">;

/** Resolve :id (uuid or slug) and verify it matches the caller's session. */
export async function resolveEventForSession(
  res: VercelResponse,
  rawId: string,
  session: Session
): Promise<EventRow | null> {
  const data = await resolveEvent(rawId);
  if (!data) {
    sendError(res, "not_found");
    return null;
  }
  if (data.id !== session.eventId) {
    sendError(res, "unauthenticated", "session is for a different event");
    return null;
  }
  return data;
}

export function eventEnded(ev: EventRow): boolean {
  // 6h grace so the after-party still uploads.
  return Date.now() > new Date(ev.ends_at).getTime() + 6 * 3600_000;
}

export interface ListParams {
  since?: string;
  limit: number;
  cursor?: { t: string; id: string };
}

export function parseListParams(req: VercelRequest): ListParams {
  const q = req.query;
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? "100"), 10) || 100, 1), 500);
  const since = typeof q.since === "string" && !isNaN(Date.parse(q.since)) ? q.since : undefined;
  let cursor;
  if (typeof q.cursor === "string" && q.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8"));
      if (typeof parsed.t === "string" && typeof parsed.id === "string") cursor = parsed;
    } catch { /* bad cursor → start from the top */ }
  }
  return { since, limit, cursor };
}

export function encodeCursor(t: string, id: string): string {
  return Buffer.from(JSON.stringify({ t, id }), "utf8").toString("base64url");
}

/**
 * List photos or videos for the gallery. Blocked media never leaves the
 * server; pending is visible (moderation fails open — docs/costs.md posture).
 */
export async function listMedia(
  res: VercelResponse,
  table: "photos" | "videos",
  bucket: string,
  eventId: string,
  params: ListParams
): Promise<void> {
  const db = admin();
  let query = db
    .from(table)
    .select("id, storage_key, taken_at, width, height, guest_id, guest_first_name, guest_last_name" + (table === "videos" ? ", duration_ms" : ""))
    .eq("event_id", eventId)
    .neq("moderation_status", "blocked")
    .order("taken_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit);
  if (params.since) query = query.gte("taken_at", params.since);
  if (params.cursor) {
    query = query.or(
      `taken_at.lt.${params.cursor.t},and(taken_at.eq.${params.cursor.t},id.lt.${params.cursor.id})`
    );
  }
  const { data: rows, error } = await query;
  if (error) throw error;

  const { count, error: cErr } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .neq("moderation_status", "blocked");
  if (cErr) throw cErr;

  const keys = (rows ?? []).map((r: any) => r.storage_key);
  const urls = await signStorageUrls(bucket, keys);

  const items = (rows ?? []).map((r: any) => ({
    id: r.id,
    url: urls[r.storage_key] ?? null,
    takenAt: r.taken_at,
    width: r.width,
    height: r.height,
    ...(table === "videos" ? { durationMs: r.duration_ms } : {}),
    guest: { id: r.guest_id, firstName: r.guest_first_name, lastName: r.guest_last_name },
  }));

  const last = rows?.[rows.length - 1] as any;
  res.status(200).json({
    [table]: items,
    total: count ?? items.length,
    nextCursor: rows && rows.length === params.limit ? encodeCursor(last.taken_at, last.id) : null,
  });
}

/** Validate the `faces` form field: JSON array of 128-float descriptors. */
export function parseFaces(raw: string | undefined): number[][] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => Array.isArray(f) && f.length === 128 && f.every((n) => typeof n === "number" && isFinite(n)))
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** 24h signed URL for a single storage object. */
export async function signedUrlFor(bucket: string, storageKey: string): Promise<string | null> {
  const { data, error } = await admin().storage.from(bucket).createSignedUrl(storageKey, 86_400);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Batch-sign storage keys; falls back to per-key signing when batch entries fail. */
export async function signStorageUrls(bucket: string, keys: string[]): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return urls;

  const { data: signed, error: sErr } = await admin().storage.from(bucket).createSignedUrls(unique, 86_400);
  if (!sErr && signed?.length) {
    for (let i = 0; i < unique.length; i++) {
      const key = unique[i];
      const entry = signed[i];
      if (!entry?.signedUrl) continue;
      urls[key] = entry.signedUrl;
      if (entry.path) {
        const norm = entry.path.replace(/^\/+/, "");
        urls[norm] = entry.signedUrl;
      }
    }
  }

  await Promise.all(unique.map(async (key) => {
    if (urls[key]) return;
    const url = await signedUrlFor(bucket, key);
    if (url) urls[key] = url;
  }));

  return urls;
}
