import type { VercelRequest, VercelResponse } from "@vercel/node";
import Busboy from "busboy";

/**
 * Shared HTTP plumbing for every function under api/.
 * Error codes + statuses mirror docs/api-contract.md exactly — if a code
 * isn't in that table, don't invent it here.
 */

const STATUS: Record<string, number> = {
  unauthenticated: 401,
  invalid_event: 400,
  invalid_name: 400,
  invalid_request: 400,
  event_ended: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  file_too_large: 413,
  payload_too_large: 413,
  unsupported_media: 415,
  moderation_blocked: 422,
  duration_too_long: 422,
  no_face_detected: 422,
  ai_disabled: 503,
  ai_provider_down: 502,
  rate_limited: 429,
  internal: 500,
};

export function sendError(res: VercelResponse, code: string, message?: string) {
  const status = STATUS[code] ?? 500;
  res.status(status).json({ error: message ?? code.replace(/_/g, " "), code });
}

export function methodGuard(req: VercelRequest, res: VercelResponse, ...allowed: string[]): boolean {
  if (allowed.includes(req.method ?? "")) return true;
  res.setHeader("Allow", allowed.join(", "));
  sendError(res, "method_not_allowed");
  return false;
}

export interface UploadedFile {
  field: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}

export interface MultipartBody {
  fields: Record<string, string>;
  files: UploadedFile[];
}

/** Parse a multipart/form-data request, buffering files up to `maxBytes`. */
export function parseMultipart(req: VercelRequest, maxBytes = 12 * 1024 * 1024): Promise<MultipartBody> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: maxBytes, files: 3, fields: 20 },
    });
    const fields: Record<string, string> = {};
    const files: UploadedFile[] = [];
    let tooLarge = false;

    bb.on("field", (name, value) => { fields[name] = value; });
    bb.on("file", (field, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("limit", () => { tooLarge = true; stream.resume(); });
      stream.on("end", () => {
        files.push({ field, filename: info.filename ?? "blob", mime: info.mimeType ?? "application/octet-stream", buffer: Buffer.concat(chunks) });
      });
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (tooLarge) reject(Object.assign(new Error("file too large"), { code: "file_too_large" }));
      else resolve({ fields, files });
    });
    // Vercel's Node helper may have already buffered the body (it does for
    // content types it doesn't parse) — feed the buffer instead of the
    // exhausted stream when that happened.
    const preRead = (req as unknown as { body?: unknown }).body;
    if (Buffer.isBuffer(preRead)) bb.end(preRead);
    else req.pipe(bb);
  });
}

// ---------------------------------------------------------------------------
// Rate limiting — best-effort, per warm function instance. Real bucketing at
// the edge is a later concern (docs/api-contract.md); this stops runaway
// clients without any external dependency.
// ---------------------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(res: VercelResponse, key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= maxPerMinute) {
    res.setHeader("Retry-After", Math.ceil((b.resetAt - now) / 1000).toString());
    sendError(res, "rate_limited");
    return false;
  }
  b.count += 1;
  return true;
}

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd ?? "";
  return raw.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}
