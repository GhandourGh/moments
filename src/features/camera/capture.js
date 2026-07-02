import { JPEG_QUALITY, MAX_EDGE, TAKE_PHOTO_TIMEOUT_MS } from '@/features/camera/constants.js';

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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Full-sensor still via ImageCapture.takePhoto() where the platform has it
 * (Chrome/Android — iOS Safari falls straight through). The sensor photo is
 * only kept when it actually beats the preview resolution; EXIF orientation
 * is honoured on decode so the pipeline output matches the canvas path.
 * Any failure or timeout falls back to the preview-frame grab, so this can
 * only ever raise quality, never break capture.
 */
export async function captureBestStill(video, stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (track && track.readyState === "live" && typeof ImageCapture !== "undefined") {
    try {
      const photoBlob = await withTimeout(new ImageCapture(track).takePhoto(), TAKE_PHOTO_TIMEOUT_MS);
      const bitmap = await createImageBitmap(photoBlob, { imageOrientation: "from-image" });
      try {
        if (Math.max(bitmap.width, bitmap.height) > Math.max(video.videoWidth, video.videoHeight)) {
          const { w, h } = fitDims(bitmap.width, bitmap.height, MAX_EDGE);
          const canvas = getCanvas(w, h);
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, w, h);
          return await canvasToJpegBlob(canvas);
        }
      } finally {
        bitmap.close?.();
      }
    } catch { /* takePhoto unsupported/slow/flaky on this device — canvas path */ }
  }
  return captureStillFromVideo(video);
}

/**
 * Average luma (0–255) of the current preview frame, sampled at 32×24.
 * Cheap enough to run inside the shutter press; drives auto-flash.
 */
export function samplePreviewLuma(video) {
  if (!video?.videoWidth) return null;
  try {
    const canvas = getCanvas(32, 24);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, 32, 24);
    const { data } = ctx.getImageData(0, 0, 32, 24);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 4);
  } catch {
    return null; // tainted canvas / hidden video — treat as "unknown"
  }
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
