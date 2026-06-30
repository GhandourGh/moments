import {
  AUDIO_BITRATE,
  VIDEO_BITRATE,
  VIDEO_MIME_CANDIDATES,
  VISIBLE_ZOOM_STEPS,
} from "../constants.js";
import {
  captureStill,
  captureWithRetinaFlash,
  captureWithTorchFlash,
  drawFrame,
  encodeCanvas,
  terminateEncodeWorker,
} from "../utils/imageCapture.js";

export const WEB_CAMERA_ADAPTER = {
  id: "web",
  label: "Web getUserMedia + canvas",
  supportsLivePreview: true,
  supportsHardwareZoom: true,
  supportsTorch: true,
  supportsBurst: true,
  supportsVideo: true,
  maxStillResolution: "preview-limited (~1080p)",
};

export function pickVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of VIDEO_MIME_CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* skip */ }
  }
  return "";
}

export function getNativeZoomCaps(stream) {
  const track = stream?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if (!caps || typeof caps.zoom !== "object") return null;
  const { min, max, step } = caps.zoom;
  if (typeof min !== "number" || typeof max !== "number" || max <= min + 0.01) return null;
  return { min, max, step: step || 0.01 };
}

export function visibleZoomSteps(min, max) {
  return VISIBLE_ZOOM_STEPS.filter((z) => z >= min - 0.01 && z <= max + 0.01);
}

export async function setNativeZoom(stream, value) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ zoom: value });
    return true;
  } catch {
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
      return true;
    } catch {
      return false;
    }
  }
}

export async function probeNativeZoom(stream) {
  const caps = getNativeZoomCaps(stream);
  if (caps) return caps;
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return null;
  const before = track.getSettings?.()?.zoom ?? 1;
  const target = Math.min(3, before + 1);
  const ok = await setNativeZoom(stream, target);
  if (!ok) return null;
  const after = track.getSettings?.()?.zoom ?? before;
  await setNativeZoom(stream, before);
  if (after > before + 0.05) {
    const max = Math.max(after * 3, 5);
    return { min: Math.min(before, 1), max, step: 0.01 };
  }
  return null;
}

export async function setTorch(stream, on) {
  const track = stream?.getVideoTracks()[0];
  if (!track?.applyConstraints) return false;
  const caps = track.getCapabilities?.();
  if (caps && "torch" in caps === false) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

export async function focusTrackAt(stream, x, y) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      advanced: [{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" }],
    });
  } catch { /* iOS Safari etc. — visual ring is the value */ }
}

export function getTorchSupported(stream) {
  const track = stream?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  return Boolean(caps && "torch" in caps && caps.torch !== false);
}

export async function openStream({ facing, mode = "photo" }) {
  if (!window.isSecureContext) {
    throw Object.assign(new Error("insecure-context"), { code: "insecure-context" });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  }

  const videoConstraints = mode === "video"
    ? {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      }
    : {
        facingMode: facing,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };

  if (mode === "video") {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      // Mic denied — still allow silent video clips.
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
    }
  }

  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
}

export async function attachStreamToVideo(stream, videoEl) {
  if (!videoEl) return;
  videoEl.srcObject = stream;
  await videoEl.play().catch(() => {});
}

export function stopStream(stream) {
  stream?.getTracks?.().forEach((t) => t.stop());
}

export function createMediaRecorder(stream) {
  if (typeof MediaRecorder === "undefined") {
    throw Object.assign(new Error("MediaRecorder unavailable"), { code: "no-mediarecorder" });
  }
  const hasAudio = stream.getAudioTracks().length > 0;
  const mime = pickVideoMime();
  const attempts = [];

  if (mime) {
    attempts.push({
      mimeType: mime,
      videoBitsPerSecond: VIDEO_BITRATE,
      ...(hasAudio ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
    });
    attempts.push({ mimeType: mime });
  }
  attempts.push({
    videoBitsPerSecond: VIDEO_BITRATE,
    ...(hasAudio ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
  });
  attempts.push({});

  for (const options of attempts) {
    try {
      return new MediaRecorder(stream, options);
    } catch {
      /* try next configuration */
    }
  }
  return new MediaRecorder(stream);
}

export function createWebCameraAdapter() {
  return {
    ...WEB_CAMERA_ADAPTER,
    openStream,
    attachStreamToVideo,
    stopStream,
    probeNativeZoom,
    setNativeZoom,
    setTorch,
    focusTrackAt,
    getTorchSupported,
    getNativeZoomCaps,
    visibleZoomSteps,
    pickVideoMime,
    createMediaRecorder,
    drawFrame,
    encodeCanvas,
    captureStill,
    captureWithRetinaFlash,
    captureWithTorchFlash,
    terminateEncodeWorker,
  };
}
