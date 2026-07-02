import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { clientIp, methodGuard, rateLimit, sendError } from "./_lib/http.js";
import { admin } from "./_lib/supabase.js";
import { readSession, requireSession, setSessionCookie } from "./_lib/session.js";
import { isGuestId, isUuid, isValidName } from "./_lib/validate.js";
import { resolveEvent } from "./_lib/events.js";
import { withSentry } from "./_lib/sentry.js";

/**
 * POST  /api/session — create-or-refresh the guest session (docs/auth.md).
 *       Upserts the guests row from the client-minted UUID + name, then sets
 *       the signed moment.sid cookie. First call in every visit.
 * PATCH /api/session — name edit from /me. Snapshot-not-backfill: existing
 *       photos.guest_first/last_name are deliberately untouched.
 */

/** guests.id is a uuid column; legacy `g-...` client ids get a stable derived uuid. */
function toGuestUuid(clientId: string): string {
  if (isUuid(clientId)) return clientId.toLowerCase();
  const h = createHash("sha256").update(`moment.guest:${clientId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function post(req: VercelRequest, res: VercelResponse) {
  if (!rateLimit(res, `session:${clientIp(req)}`, 60)) return;

  const { event, guestId, firstName, lastName } = (req.body ?? {}) as Record<string, unknown>;
  if (!isGuestId(guestId)) return sendError(res, "invalid_request", "guestId must be a client-minted UUID");
  if (!isValidName(firstName) || !isValidName(lastName)) return sendError(res, "invalid_name");
  if (typeof event !== "string" || !event) return sendError(res, "invalid_event");

  const db = admin();
  const ev = await resolveEvent(event);
  if (!ev) return sendError(res, "invalid_event");

  const id = toGuestUuid(guestId);
  const { error: upErr } = await db.from("guests").upsert(
    {
      id,
      event_id: ev.id,
      first_name: (firstName as string).trim(),
      last_name: (lastName as string).trim(),
      device_id: guestId,
    },
    { onConflict: "event_id,device_id" }
  );
  if (upErr) throw upErr;

  await setSessionCookie(res, { guestId: id, eventId: ev.id });
  res.status(200).json({ guestId: id, eventId: ev.id });
}

async function patch(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req, res);
  if (!session) return;
  if (!rateLimit(res, `session-patch:${session.guestId}`, 10)) return;

  const { firstName, lastName } = (req.body ?? {}) as Record<string, unknown>;
  if (!isValidName(firstName) || !isValidName(lastName)) return sendError(res, "invalid_name");

  const { error } = await admin()
    .from("guests")
    .update({ first_name: (firstName as string).trim(), last_name: (lastName as string).trim() })
    .eq("id", session.guestId)
    .eq("event_id", session.eventId);
  if (error) throw error;

  res.status(200).json({ ok: true });
}

export default withSentry(async (req, res) => {
  if (!methodGuard(req, res, "POST", "PATCH")) return;
  if (req.method === "POST") return post(req, res);
  return patch(req, res);
});
