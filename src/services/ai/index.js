/**
 * AI/ML adapter — provider-agnostic surface.
 *
 * The client never calls model APIs directly. Every request goes through a
 * gateway (VITE_AI_GATEWAY_URL) so provider keys stay off the device and we
 * can swap providers without shipping a new app build.
 *
 * Current surfaces (all optional, gated by feature flags in config/env.js):
 *   - faceMatch(selfieBlob, eventId): match a guest selfie against uploaded
 *     photos on the server.
 *   - captionPhoto(blob):             generate an accessible alt-text caption.
 *   - moderatePhoto(blob):            reject unsafe uploads before publishing.
 *
 * Drivers live in ./drivers/. Each returns the same shape.
 */

import { env } from "@/config/env.js";

const contract = {
  async faceMatch(_blob, _eventId) { throw new Error("ai.faceMatch not implemented"); },
  async captionPhoto(_blob) { throw new Error("ai.captionPhoto not implemented"); },
  async moderatePhoto(_blob) { throw new Error("ai.moderatePhoto not implemented"); },
};

function noopDriver() {
  return {
    id: "none",
    ...contract,
    async faceMatch() { return { matched: [] }; },
    async captionPhoto() { return { caption: "" }; },
    async moderatePhoto() { return { allowed: true, reasons: [] }; },
  };
}

async function loadDriver() {
  switch (env.ai.provider) {
    // case "anthropic": return (await import("./drivers/anthropic.js")).default;
    // case "openai":    return (await import("./drivers/openai.js")).default;
    default: return noopDriver();
  }
}

let cached = null;
export async function getAi() {
  if (!cached) cached = loadDriver();
  return cached;
}

/** Feature-flag helper for surfaces that need to know if AI is on. */
export function isFaceMatchEnabled() {
  return env.ai.faceMatchEnabled && env.ai.provider !== "none";
}
