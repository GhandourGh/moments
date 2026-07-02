/**
 * Central env reader. All Vite env access goes through here so we have one
 * place to trace which variables the app actually depends on. Add new env
 * lookups to this file — do not read import.meta.env directly from features.
 *
 * Every value is resolved once at module load; envs are static at build time.
 */

function readString(key, fallback = "") {
  const v = import.meta.env[key];
  return typeof v === "string" ? v : fallback;
}

function readBool(key, fallback = false) {
  const v = import.meta.env[key];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export const env = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,

  /** Sentry DSN for the frontend. Empty = error reporting off. */
  sentryDsn: readString("VITE_SENTRY_DSN"),

  api: {
    /** Base URL for the photo backend. Empty = local-only mode. */
    base: readString("VITE_API_BASE").replace(/\/+$/, ""),
    /**
     * Dev-only event fallback so `vite dev` works without a /e/<slug> URL.
     * Production must NOT set this — the event comes exclusively from the
     * URL path (state/activeEvent), and a baked-in fallback silently routes
     * uploads to the wrong event.
     */
    eventId: readString("VITE_EVENT_ID"),
  },

  db: {
    /** Which database driver services/db should mount ("supabase" | "neon" | "none"). */
    provider: readString("VITE_DB_PROVIDER", "none"),
    url: readString("VITE_DB_URL"),
    anonKey: readString("VITE_DB_ANON_KEY"),
  },

  ai: {
    /** Which AI provider services/ai should call ("anthropic" | "openai" | "none"). */
    provider: readString("VITE_AI_PROVIDER", "none"),
    /** Public URL of a gateway that proxies requests to the provider. */
    gatewayUrl: readString("VITE_AI_GATEWAY_URL"),
    /** Feature flags for AI surfaces. */
    faceMatchEnabled: readBool("VITE_AI_FACE_MATCH", false),
  },
};
