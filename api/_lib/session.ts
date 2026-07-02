import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { sendError } from "./http.js";

/**
 * Signed session cookie `moment.sid` — payload { guestId, eventId, iat },
 * HS256, 1-year expiry, HttpOnly + Secure + SameSite=Lax (docs/auth.md).
 */

const COOKIE = "moment.sid";
const MAX_AGE = 31_536_000; // 1 year

export interface Session {
  guestId: string;
  eventId: string;
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not configured");
  return new TextEncoder().encode(s);
}

export async function setSessionCookie(res: VercelResponse, session: Session): Promise<void> {
  const jwt = await new SignJWT({ guestId: session.guestId, eventId: session.eventId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${jwt}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
  );
}

export async function readSession(req: VercelRequest): Promise<Session | null> {
  const header = req.headers.cookie ?? "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return null;
  const token = match.slice(COOKIE.length + 1);
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.guestId !== "string" || typeof payload.eventId !== "string") return null;
    return { guestId: payload.guestId, eventId: payload.eventId };
  } catch {
    return null;
  }
}

/** Read the session or write a 401 and return null. */
export async function requireSession(req: VercelRequest, res: VercelResponse): Promise<Session | null> {
  const session = await readSession(req);
  if (!session) sendError(res, "unauthenticated");
  return session;
}

/**
 * Constant-time admin passcode check for the host flow. Hashing both sides
 * first means the comparison length never depends on the secret, so there is
 * no early-return on length mismatch to leak timing.
 */
export function isAdmin(req: VercelRequest): boolean {
  const expected = process.env.ADMIN_PASSCODE;
  const got = req.headers["x-admin-passcode"];
  if (!expected || typeof got !== "string") return false;
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
