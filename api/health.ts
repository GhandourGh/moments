import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/health — deploy sentinel + smoke test target.
 *
 * Returns 200 with the deployed version, commit sha, and region. Used by
 * uptime checks and by CI before promoting a preview. Intentionally has no
 * dependencies on Supabase or Anthropic — this endpoint must succeed even
 * when everything else is broken, so we can tell whether the platform is up.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method_not_allowed", code: "method_not_allowed" });
    return;
  }

  res.status(200).json({
    ok: true,
    version: process.env.npm_package_version ?? "0.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    region: process.env.VERCEL_REGION ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
  });
}
