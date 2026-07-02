import { admin } from "./supabase.js";
import { isUuid } from "./validate.js";

/**
 * Single source of truth for ":id is a uuid or a slug" resolution. Every
 * endpoint that accepts an event by id-or-slug must go through here — the
 * old per-file regexes disagreed on 36-char non-UUID strings (a loose
 * /^[0-9a-f-]{36}$/ vs the strict isUuid), so the same path param could
 * resolve to different events depending on the endpoint.
 */

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  cover_photo_id: string | null;
  content: Record<string, unknown> | null;
}

/** Look up an event by uuid (strict) or slug. Returns null when not found. */
export async function resolveEvent(idOrSlug: string): Promise<EventRecord | null> {
  if (!idOrSlug) return null;
  const { data, error } = await admin()
    .from("events")
    .select("id, slug, title, starts_at, ends_at, cover_photo_id, content")
    .eq(isUuid(idOrSlug) ? "id" : "slug", idOrSlug)
    .maybeSingle();
  if (error) throw error;
  return data as EventRecord | null;
}
