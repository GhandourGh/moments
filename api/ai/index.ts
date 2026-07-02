import { methodGuard, parseMultipart, rateLimit, sendError } from "../_lib/http.js";
import { requireSession } from "../_lib/session.js";
import { moderateImage, moderationEnabled, captionImage, captionsEnabled } from "../_lib/ai.js";
import { withSentry } from "../_lib/sentry.js";

/**
 * POST /api/ai/moderate — optional client preflight (action=moderate rewrite).
 * POST /api/ai/caption — accessible alt-text (action=caption rewrite).
 * Merged into one function for Vercel Hobby's 12-function cap.
 */

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const session = await requireSession(req, res);
  if (!session) return;

  const action = String(req.query.action ?? "moderate");

  if (action === "caption") {
    if (!rateLimit(res, `caption:${session.guestId}`, 20)) return;
    if (!captionsEnabled()) return sendError(res, "ai_disabled");
    const body = await parseMultipart(req).catch(() => null);
    const file = body?.files[0];
    if (!file || !file.buffer.length) return sendError(res, "invalid_request", "missing file");
    try {
      const caption = await captionImage(file.buffer, file.mime);
      return res.status(200).json({ caption });
    } catch {
      return sendError(res, "ai_provider_down");
    }
  }

  if (!rateLimit(res, `moderate:${session.guestId}`, 60)) return;
  if (!moderationEnabled()) return sendError(res, "ai_disabled");
  const body = await parseMultipart(req).catch(() => null);
  const file = body?.files[0];
  if (!file || !file.buffer.length) return sendError(res, "invalid_request", "missing file");

  const verdict = await moderateImage(file.buffer, file.mime);
  if (!verdict) return sendError(res, "ai_provider_down");
  res.status(200).json(verdict);
});
