import { methodGuard, parseMultipart, rateLimit, sendError } from "../_lib/http.js";
import { requireSession } from "../_lib/session.js";
import { captionImage, captionsEnabled } from "../_lib/ai.js";
import { withSentry } from "../_lib/sentry.js";

/**
 * POST /api/ai/caption — accessible alt-text for a photo. Ships default-OFF
 * (AI_CAPTIONS=true to enable): captions are the $9/event line in
 * docs/costs.md, everything else is cents.
 */
export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const session = await requireSession(req, res);
  if (!session) return;
  if (!rateLimit(res, `caption:${session.guestId}`, 20)) return;
  if (!captionsEnabled()) return sendError(res, "ai_disabled");

  const body = await parseMultipart(req).catch(() => null);
  const file = body?.files[0];
  if (!file || !file.buffer.length) return sendError(res, "invalid_request", "missing file");

  try {
    const caption = await captionImage(file.buffer, file.mime);
    res.status(200).json({ caption });
  } catch {
    sendError(res, "ai_provider_down");
  }
});
