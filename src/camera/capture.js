import { JPEG_QUALITY, MAX_EDGE } from "./constants.js";

function fitDims(srcW, srcH, maxEdge) {
  const long = Math.max(srcW, srcH);
  if (long <= maxEdge) return { w: srcW, h: srcH };
  const scale = maxEdge / long;
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

let reusedCanvas = null;
function getCanvas(w, h) {
  if (!reusedCanvas) reusedCanvas = document.createElement("canvas");
  reusedCanvas.width = w;
  reusedCanvas.height = h;
  return reusedCanvas;
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** Wait one painted video frame. Uses rVFC when available, rAF as fallback. */
export function waitForVideoFrame(video) {
  return new Promise((resolve) => {
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => resolve());
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }
  });
}

export async function captureStillFromVideo(video) {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return null;
  const { w, h } = fitDims(srcW, srcH, MAX_EDGE);
  const canvas = getCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, srcW, srcH, 0, 0, w, h);
  return canvasToJpegBlob(canvas);
}

export async function downscaleImageFile(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const { w, h } = fitDims(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = getCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, w, h);
    return await canvasToJpegBlob(canvas);
  } finally {
    bitmap.close?.();
  }
}

export function pickVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* skip */ }
  }
  return "";
}
