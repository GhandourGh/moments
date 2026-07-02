import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as Sentry from "@sentry/node";
import { sendError } from "./http.js";

/**
 * Error reporting for api/ functions. No-ops when SENTRY_DSN is unset so
 * local dev and previews work without an account. Wrap every handler:
 *
 *   export default withSentry(async (req, res) => { ... });
 */

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, environment: process.env.VERCEL_ENV ?? "development", tracesSampleRate: 0 });
}

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

/**
 * Report a non-fatal error (the request still succeeds). Use for best-effort
 * side work — face embedding inserts, storage cleanup — where failing the
 * whole request would be worse than losing the side effect.
 */
export function captureError(err: unknown, extra?: Record<string, unknown>): void {
  if (dsn) Sentry.captureException(err, { extra });
  console.error(JSON.stringify({ level: "error", message: (err as Error)?.message ?? String(err), ...extra }));
}

export function withSentry(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (dsn) {
        Sentry.captureException(err, { extra: { url: req.url, method: req.method } });
        await Sentry.flush(2000).catch(() => {});
      }
      console.error(JSON.stringify({ level: "error", url: req.url, message: (err as Error)?.message }));
      if (!res.headersSent) sendError(res, "internal");
    }
  };
}
