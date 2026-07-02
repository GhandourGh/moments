import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server-only — this key bypasses RLS, which is
 * intentional: guest writes on `guests`, all writes on `events`, and inserts
 * on `face_embeddings` deliberately have no RLS policy (docs/data-model.md).
 * The functions in api/ are the authorization layer for those paths.
 */

let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
