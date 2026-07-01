/**
 * Database adapter — provider-agnostic surface for the app.
 *
 * The photo pipeline stays in services/storage (IndexedDB + upload queue).
 * This module is the seam for higher-level persisted data: events, guests,
 * albums, comments, reactions — things that outlive a single device.
 *
 * Wire a provider by setting VITE_DB_PROVIDER in .env (see .env.example) and
 * filling in one of the drivers below. All drivers must implement the same
 * shape so features can call `db.<method>()` without caring about the backend.
 */

import { env } from "@/config/env.js";

/** Contract every driver implements. Kept intentionally small on purpose. */
const contract = {
  async getEvent(_eventId) { throw new Error("db.getEvent not implemented"); },
  async listGuests(_eventId) { throw new Error("db.listGuests not implemented"); },
  async recordCapture(_eventId, _payload) { throw new Error("db.recordCapture not implemented"); },
  async listCaptures(_eventId, _opts) { throw new Error("db.listCaptures not implemented"); },
};

function noopDriver() {
  return {
    id: "none",
    ...contract,
    async getEvent() { return null; },
    async listGuests() { return []; },
    async recordCapture() { return { ok: false, reason: "no-db" }; },
    async listCaptures() { return []; },
  };
}

async function loadDriver() {
  switch (env.db.provider) {
    // case "supabase": return (await import("./drivers/supabase.js")).default;
    // case "neon":     return (await import("./drivers/neon.js")).default;
    default: return noopDriver();
  }
}

let cached = null;
export async function getDb() {
  if (!cached) cached = loadDriver();
  return cached;
}
