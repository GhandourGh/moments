import { methodGuard, parseMultipart, rateLimit, sendError } from "../_lib/http.js";
import { requireSession } from "../_lib/session.js";
import { moderateImage, moderationEnabled } from "../_lib/ai.js";
import { withSentry } from "../_lib/sentry.js";

/**
 * POST /api/ai/moderate — optional client preflight (docs/api-contract.md).
 * The authoritative check runs server-side inside the photo upload; this
 * endpoint exists so the client can warn before wasting an upload.
 */
export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const session = await requireSession(req, res);
  if (!session) return;
  if (!rateLimit(res, `moderate:${session.guestId}`, 60)) return;
  if (!moderationEnabled()) return sendError(res, "ai_disabled");

  const body = await parseMultipart(req).catch(() => null);
  const file = body?.files[0];
  if (!file || !file.buffer.length) return sendError(res, "invalid_request", "missing file");

  const verdict = await moderateImage(file.buffer, file.mime);
  if (!verdict) return sendError(res, "ai_provider_down");
  res.status(200).json(verdict);
});
