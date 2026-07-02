/**
 * On-demand gallery face indexing — runs only from /me, never on upload.
 *
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
  const res = await fetch(shot.url, { signal, credentials: "omit" });
  if (!res.ok) return null;
  return res.blob();
}

/** Index photos missing server-side embeddings. Safe to call repeatedly. */
export async function ensureGalleryIndexed(shots, { signal } = {}) {
  if (!enabled()) return { indexed: 0 };
  const pending = shots.filter((s) => {
    if (s.seed || (s.mediaType ?? "photo") === "video") return false;
    const id = s.serverId;
    return id && !indexed.has(id) && s.url;
  });
  if (!pending.length) return { indexed: 0 };

  if (inflight) return inflight;

  inflight = (async () => {
    let done = 0;
    for (const shot of pending) {
      if (signal?.aborted) break;
      const photoId = shot.serverId;
      try {
        const blob = await blobFromShot(shot, signal);
        if (!blob) {
          indexed.add(photoId);
          continue;
        }
        const embeddings = await descriptorsForPhoto(blob);
        if (embeddings.length) {
          await postFaceEmbeddings([{ photoId, embeddings }], { signal });
          done += 1;
        }
      } catch {
        /* best-effort — one bad photo must not block the rest */
      } finally {
        indexed.add(photoId);
      }
    }
    return { indexed: done };
  })().finally(() => { inflight = null; });

  return inflight;
}
