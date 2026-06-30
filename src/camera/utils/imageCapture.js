import { flushSync } from "react-dom";
import { acquireCanvas } from "./canvasPool.js";
import {
  JPEG_QUALITY,
  MAX_EDGE,
  RETINA_CAPTURE_AT_MS,
  RETINA_TOTAL_MS,
  TORCH_WINDOW_MS,
} from "../constants.js";
import EncodeWorker from "./encodeWorker.js?worker";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function fitDims(srcW, srcH, maxEdge) {
  const long = Math.max(srcW, srcH);
  if (long <= maxEdge) return { w: srcW, h: srcH };
  const scale = maxEdge / long;
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

export function drawFrame(source, srcW, srcH) {
  const { w, h } = fitDims(srcW, srcH, MAX_EDGE);
  const canvas = acquireCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, w, h);
  return canvas;
}

function canvasToBlobMain(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

let worker = null;
let jobId = 0;
const pendingJobs = new Map();

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  try {
    worker = new EncodeWorker();
    worker.onmessage = (e) => {
      const { id, ok, buffer, error } = e.data;
      const job = pendingJobs.get(id);
      if (!job) return;
      pendingJobs.delete(id);
      if (ok) job.resolve(new Blob([buffer], { type: "image/jpeg" }));
      else job.reject(new Error(error || "Worker encode failed"));
    };
    worker.onerror = (err) => {
      pendingJobs.forEach(({ reject }) => reject(err));
      pendingJobs.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export function encodeBitmap(bitmap) {
  const w = getWorker();
  if (!w) {
    const canvas = acquireCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvasToBlobMain(canvas);
  }
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    w.postMessage({ id, bitmap, maxEdge: MAX_EDGE, quality: JPEG_QUALITY }, [bitmap]);
  });
}

export function encodeCanvas(canvas) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(canvas).then((bitmap) => encodeBitmap(bitmap));
  }
  return canvasToBlobMain(canvas);
}

async function sourceToBitmap(source, srcW, srcH) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source, 0, 0, srcW, srcH);
    } catch { /* fall through */ }
  }
  const canvas = drawFrame(source, srcW, srcH);
  return createImageBitmap(canvas);
}

export async function encodeSourceToJpeg(source, srcW, srcH) {
  if (getWorker() && typeof createImageBitmap === "function") {
    const bitmap = await sourceToBitmap(source, srcW, srcH);
    return encodeBitmap(bitmap);
  }
  return canvasToBlobMain(drawFrame(source, srcW, srcH));
}

/** Whether ImageCapture is available for this stream's video track. */
export function supportsImageCapture(stream) {
  if (typeof ImageCapture === "undefined") return false;
  const track = stream?.getVideoTracks?.()[0];
  return Boolean(track && track.readyState === "live");
}

/**
 * Capture a still from the live video frame.
 * Canvas grab keeps the preview stream alive — ImageCapture.takePhoto()
 * often freezes or blacks out the preview on iOS Safari after the first shot.
 */
export async function captureStill(_stream, video) {
  if (!video?.videoWidth) return null;
  return encodeSourceToJpeg(video, video.videoWidth, video.videoHeight);
}

export async function captureWithRetinaFlash(video, setPlaying) {
  flushSync(() => setPlaying(true));
  try {
    await waitForPaint();
    await sleep(RETINA_CAPTURE_AT_MS);
    return drawFrame(video, video.videoWidth, video.videoHeight);
  } finally {
    await sleep(RETINA_TOTAL_MS - RETINA_CAPTURE_AT_MS);
    flushSync(() => setPlaying(false));
  }
}

export async function captureWithTorchFlash(stream, video, previewTorchOn, setTorch) {
  const hadPreviewTorch = previewTorchOn;
  if (hadPreviewTorch) await setTorch(stream, false);
  const torchLit = await setTorch(stream, true);
  if (!torchLit) {
    if (hadPreviewTorch) await setTorch(stream, true);
    return null;
  }
  await waitForPaint();
  await sleep(TORCH_WINDOW_MS);
  const canvas = drawFrame(video, video.videoWidth, video.videoHeight);
  await setTorch(stream, false);
  if (hadPreviewTorch) await setTorch(stream, true);
  return canvas;
}

export function drawableToBlob(source, srcW, srcH) {
  return encodeSourceToJpeg(source, srcW, srcH);
}

export async function fileToDownscaledBlob(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  try {
    const blob = await drawableToBlob(bitmap, bitmap.width, bitmap.height);
    return blob ?? file;
  } finally {
    bitmap.close?.();
  }
}

export function terminateEncodeWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingJobs.clear();
}
