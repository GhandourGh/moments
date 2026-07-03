/**
 * Gallery face indexing — runs only when a guest explicitly starts a scan on /me.
 * Downloads each event photo once per session, extracts face descriptors
 * on-device, and posts them to the embeddings API so match_faces can run.
 */

import { env } from '@/config/env.js';
import { postFaceEmbeddings } from '@/services/api/index.js';
import { descriptorsForPhoto } from '@/services/faces/index.js';

const indexed = new Set();
let inflight = null;

function enabled() {
  return env.ai.faceMatchEnabled;
}

async function blobFromShot(shot, signal) {
  if (!shot.url) return null;
  const sameOrigin = shot.url.startsWith("/");
  const res = await fetch(shot.url, {
    signal,
    credentials: sameOrigin ? "include" : "omit",
  });
  if (!res.ok) return null;
  return res.blob();
}

/**
 * Index photos missing server-side embeddings.
 * @param {object[]} shots
 * @param {{ signal?: AbortSignal, onProgress?: (p: { scanned: number, total: number }) => void }} opts
 */
export async function ensureGalleryIndexed(shots, { signal, onProgress } = {}) {
  if (!enabled()) return { indexed: 0, scanned: 0, total: 0 };
  const pending = shots.filter((s) => {
    if (s.seed || (s.mediaType ?? "photo") === "video") return false;
    const id = s.serverId;
    return id && !indexed.has(id) && s.url;
  });
  const total = pending.length;
  if (!total) {
    onProgress?.({ scanned: 0, total: 0 });
    return { indexed: 0, scanned: 0, total: 0 };
  }

  if (inflight) return inflight;

  inflight = (async () => {
    let done = 0;
    let scanned = 0;
    const BATCH = 10;
    let batch = [];

    const flush = async () => {
      if (!batch.length) return;
      const items = batch;
      batch = [];
      try {
        await postFaceEmbeddings(items, { signal });
        done += items.length;
      } catch {
        items.forEach((it) => indexed.delete(it.photoId));
      }
    };

    for (const shot of pending) {
      if (signal?.aborted) break;
      const photoId = shot.serverId;
      try {
        const blob = await blobFromShot(shot, signal);
        if (blob) {
          const embeddings = await descriptorsForPhoto(blob);
          if (embeddings.length) batch.push({ photoId, embeddings });
        }
      } catch {
        /* best-effort — one bad photo must not block the rest */
      } finally {
        indexed.add(photoId);
        scanned += 1;
        onProgress?.({ scanned, total });
      }
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    return { indexed: done, scanned, total };
  })().finally(() => { inflight = null; });

  return inflight;
}

/** Clear session index cache so a rescan re-processes photos. */
export function resetGalleryIndexSession() {
  indexed.clear();
}
