/**
 * On-device face embeddings — the reason face match costs $0/event.
 *
 * Uses @vladmandic/face-api (tiny detector + 68-landmark + recognition net,
 * ~7 MB of weights served from /models, lazy-loaded on first use). Descriptors
 * are 128-dim L2-normalised vectors; the server matches them with pgvector
 * cosine search (moment.match_faces). Raw selfies never leave the phone.
 *
 * Everything here is best-effort: if the model fails to load or a photo has
 * no faces, callers get [] / null and the upload proceeds without embeddings.
 */

import { env } from '@/config/env.js';

let loadPromise = null;
let faceapi = null;

function enabled() {
  return env.ai.faceMatchEnabled;
}

async function ensureModels() {
  if (!enabled()) return null;
  if (!loadPromise) {
    loadPromise = (async () => {
      const mod = await import("@vladmandic/face-api");
      await mod.nets.tinyFaceDetector.loadFromUri("/models");
      await mod.nets.faceLandmark68Net.loadFromUri("/models");
      await mod.nets.faceRecognitionNet.loadFromUri("/models");
      faceapi = mod;
      return mod;
    })().catch((err) => {
      loadPromise = null; // allow retry on next call
      throw err;
    });
  }
  return loadPromise;
}

async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    return { img, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

const DETECT_OPTS = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });

/** All face descriptors in a captured photo (max 20). [] when none/off/failed. */
export async function descriptorsForPhoto(blob) {
  try {
    const api = await ensureModels();
    if (!api) return [];
    const { img, release } = await blobToImage(blob);
    try {
      const detections = await api
        .detectAllFaces(img, DETECT_OPTS())
        .withFaceLandmarks()
        .withFaceDescriptors();
      return detections.slice(0, 20).map((d) => Array.from(d.descriptor));
    } finally {
      release();
    }
  } catch {
    return [];
  }
}

/** The single most prominent face in a selfie. null when none/off/failed. */
export async function descriptorForSelfie(blob) {
  try {
    const api = await ensureModels();
    if (!api) return null;
    const { img, release } = await blobToImage(blob);
    try {
      const detection = await api
        .detectSingleFace(img, DETECT_OPTS())
        .withFaceLandmarks()
        .withFaceDescriptor();
      return detection ? Array.from(detection.descriptor) : null;
    } finally {
      release();
    }
  } catch {
    return null;
  }
}

/** Kick off the model download early (e.g. after first paint). */
export function warmup() {
  if (enabled()) ensureModels().catch(() => {});
}
