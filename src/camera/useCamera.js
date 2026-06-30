import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePinch } from "@use-gesture/react";
import {
  AUDIO_BITRATE,
  FOCUS_RING_MS,
  RETINA_FADE_MS,
  RETINA_HOLD_MS,
  TORCH_FLASH_MS,
  VIDEO_BITRATE,
  VIDEO_MAX_MS,
  VISIBLE_ZOOM_STEPS,
  ZOOM_APPLY_DEBOUNCE_MS,
  ZOOM_HUD_MS,
} from "./constants.js";
import { captureStillFromVideo, pickVideoMime, waitForVideoFrame } from "./capture.js";
import { playRecordStart, playRecordStop, playShutter } from "../lib/sounds.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getVideoTrack(stream) {
  return stream?.getVideoTracks?.()[0] || null;
}

function readZoomCaps(stream) {
  const track = getVideoTrack(stream);
  const caps = track?.getCapabilities?.();
  if (!caps || typeof caps.zoom !== "object") return null;
  const { min, max, step } = caps.zoom;
  if (typeof min !== "number" || typeof max !== "number" || max <= min + 0.01) return null;
  return { min, max, step: step || 0.01 };
}

function readTorchSupported(stream) {
  const track = getVideoTrack(stream);
  const caps = track?.getCapabilities?.();
  return Boolean(caps && "torch" in caps && caps.torch !== false);
}

async function setTorch(stream, on) {
  const track = getVideoTrack(stream);
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: !!on }] });
    return true;
  } catch {
    return false;
  }
}

async function applyTrackZoom(stream, value) {
  const track = getVideoTrack(stream);
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
    return true;
  } catch {
    return false;
  }
}

async function focusAtPoint(stream, x, y) {
  const track = getVideoTrack(stream);
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      advanced: [{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" }],
    });
  } catch { /* iOS Safari ignores; visual ring still fires */ }
}

function buildVideoConstraints(facing, mode) {
  if (mode === "video") {
    return {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    };
  }
  return {
    facingMode: facing,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

async function openStream(facing, mode) {
  if (!window.isSecureContext) {
    throw Object.assign(new Error("insecure-context"), { code: "insecure-context" });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  }
  const video = buildVideoConstraints(facing, mode);
  if (mode === "video") {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
  }
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((t) => {
    try { t.stop(); } catch { /* no-op */ }
  });
}

function visibleZoomSteps(min, max) {
  return VISIBLE_ZOOM_STEPS.filter((z) => z >= min - 0.01 && z <= max + 0.01);
}

function createRecorder(stream) {
  if (typeof MediaRecorder === "undefined") {
    throw Object.assign(new Error("no-mediarecorder"), { code: "no-mediarecorder" });
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
  for (const opts of attempts) {
    try { return new MediaRecorder(stream, opts); } catch { /* try next */ }
  }
  return new MediaRecorder(stream);
}

/** Single hook owning camera lifecycle, capture, video, zoom, focus, flash. */
export function useCamera({ videoRef, facing, mode, permissionGate, isSelfie }) {
  const streamRef = useRef(null);
  const captureLockRef = useRef(false);
  const focusTimerRef = useRef(0);
  const zoomTimerRef = useRef(0);
  const zoomHudTimerRef = useRef(0);
  const pinchStartRef = useRef(1);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordMimeRef = useRef("");
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef(0);
  const pendingRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [zoomCaps, setZoomCaps] = useState(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flashMode, setFlashMode] = useState("off");
  const [zoom, setZoomState] = useState(1);
  const [zoomHudVisible, setZoomHudVisible] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);
  const [retinaFlashOn, setRetinaFlashOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pending, setPendingState] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [ringLightOn, setRingLightOn] = useState(false);

  const setPending = useCallback((value) => {
    pendingRef.current = value;
    setPendingState(value);
  }, []);

  const hasHardwareZoom = !!zoomCaps && zoomCaps.max > zoomCaps.min + 0.01;
  const visibleZoomList = useMemo(
    () => (hasHardwareZoom ? visibleZoomSteps(zoomCaps.min, zoomCaps.max) : []),
    [hasHardwareZoom, zoomCaps],
  );

  // -- Stream lifecycle ----------------------------------------------------
  useEffect(() => {
    if (permissionGate) {
      setReady(false);
      return undefined;
    }
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const stream = await openStream(facing, mode);
        if (cancelled) { stopStream(stream); return; }
        streamRef.current = stream;
        const caps = readZoomCaps(stream);
        setZoomCaps(caps);
        setZoomState(caps?.min ?? 1);
        setTorchSupported(readTorchSupported(stream));
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try { await video.play(); } catch { /* autoplay may need user gesture; preview still mounts */ }
        }
        if (cancelled) { stopStream(stream); streamRef.current = null; return; }
        setReady(true);
        setError("");
      } catch (e) {
        if (cancelled) return;
        if (e?.code === "insecure-context") {
          setError(
            "The camera needs a secure connection. Open this app with https:// " +
            "(the dev server prints an https Network URL).",
          );
        } else if (e?.code === "unsupported") {
          setError("This browser doesn't support the in-app camera.");
        } else if (e?.name === "NotAllowedError") {
          setError(
            "Camera access was denied. Allow it in your browser settings, or " +
            "choose a photo from your library below.",
          );
        } else {
          setError(
            "Couldn't open the camera on this device. You can still choose a photo from your library.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        setTorch(streamRef.current, false).catch(() => {});
        stopStream(streamRef.current);
        streamRef.current = null;
      }
    };
  }, [facing, mode, permissionGate, videoRef]);

  // Reset torch on facing change.
  useEffect(() => { setTorchOn(false); }, [facing]);

  // -- Preview torch (continuous light, back camera) -----------------------
  useEffect(() => {
    if (!ready || !torchSupported || isSelfie) return;
    setTorch(streamRef.current, torchOn).catch(() => {});
  }, [torchOn, torchSupported, isSelfie, ready]);

  // -- Zoom: debounced track constraint, never per-pointermove ------------
  useEffect(() => {
    if (!hasHardwareZoom) return;
    clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      applyTrackZoom(streamRef.current, Math.max(zoomCaps.min, Math.min(zoomCaps.max, zoom)))
        .catch(() => {});
    }, ZOOM_APPLY_DEBOUNCE_MS);
  }, [zoom, hasHardwareZoom, zoomCaps]);

  const showZoomHud = useCallback(() => {
    setZoomHudVisible(true);
    clearTimeout(zoomHudTimerRef.current);
    zoomHudTimerRef.current = setTimeout(() => setZoomHudVisible(false), ZOOM_HUD_MS);
  }, []);

  const setZoom = useCallback((value) => {
    if (!hasHardwareZoom) return;
    const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, value));
    setZoomState(clamped);
    showZoomHud();
  }, [hasHardwareZoom, zoomCaps, showZoomHud]);

  const resetZoom = useCallback(() => {
    setZoomState(zoomCaps?.min ?? 1);
  }, [zoomCaps]);

  const bindPinch = usePinch(
    ({ offset: [rawZoom], first }) => {
      if (!hasHardwareZoom) return;
      if (first) pinchStartRef.current = zoom;
      const base = pinchStartRef.current;
      const ratio = base > 0 ? rawZoom / base : 1;
      const accelerated = ratio > 1 ? base * (1 + (ratio - 1) * 2) : base * (1 - (1 - ratio) * 2);
      const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, accelerated));
      setZoomState(clamped);
      showZoomHud();
    },
    {
      enabled: hasHardwareZoom,
      scaleBounds: { min: zoomCaps?.min ?? 1, max: zoomCaps?.max ?? 1 },
      rubberband: true,
      from: () => [zoom, 0],
    },
  );

  // -- Tap-to-focus -------------------------------------------------------
  const focusAt = useCallback(async (clientX, clientY) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = video.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setFocusPoint({ x, y, id: Date.now() });
    clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusPoint(null), FOCUS_RING_MS);
    await focusAtPoint(streamRef.current, x, y);
  }, [videoRef]);

  // -- Flash mode cycling -------------------------------------------------
  const cycleFlash = useCallback(() => {
    setFlashMode((m) => (m === "off" ? "on" : "off"));
  }, []);

  const toggleTorch = useCallback(() => setTorchOn((v) => !v), []);

  // -- Capture -------------------------------------------------------------
  const snap = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !video.videoWidth || captureLockRef.current) return;
    captureLockRef.current = true;
    setCapturing(true);

    const useSelfieFlash = isSelfie && flashMode === "on";
    const useTorchFlash = !isSelfie && torchSupported && flashMode === "on";

    try {
      playShutter();
      try { navigator.vibrate?.(8); } catch { /* no-op */ }

      if (useSelfieFlash) {
        setRetinaFlashOn(true);
        await sleep(RETINA_FADE_MS + 20);
        await waitForVideoFrame(video);
        const blob = await captureStillFromVideo(video);
        await sleep(RETINA_HOLD_MS);
        setRetinaFlashOn(false);
        if (blob) setPending({ blob, url: URL.createObjectURL(blob) });
        return;
      }

      if (useTorchFlash) {
        const wasPreviewTorch = torchOn;
        if (wasPreviewTorch) await setTorch(stream, false);
        const lit = await setTorch(stream, true);
        if (lit) {
          await waitForVideoFrame(video);
          await sleep(TORCH_FLASH_MS);
        }
        const blob = await captureStillFromVideo(video);
        if (lit) await setTorch(stream, false);
        if (wasPreviewTorch) await setTorch(stream, true);
        if (blob) setPending({ blob, url: URL.createObjectURL(blob) });
        return;
      }

      const blob = await captureStillFromVideo(video);
      if (blob) setPending({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      console.error("Capture failed:", err);
      setRetinaFlashOn(false);
    } finally {
      captureLockRef.current = false;
      setCapturing(false);
    }
  }, [videoRef, isSelfie, flashMode, torchSupported, torchOn, setPending]);

  // -- Retake / Resume preview --------------------------------------------
  const resumePreview = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    requestAnimationFrame(() => {
      if (video.srcObject && video.paused) video.play().catch(() => {});
    });
  }, [videoRef]);

  const retake = useCallback(() => {
    const cur = pendingRef.current;
    if (cur?.url) URL.revokeObjectURL(cur.url);
    setPending(null);
    resumePreview();
  }, [resumePreview, setPending]);

  // -- Recording ----------------------------------------------------------
  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    try { navigator.vibrate?.(8); } catch { /* no-op */ }
    playRecordStop();
    try {
      if (rec.state === "recording") rec.requestData();
      rec.stop();
    } catch { /* onstop may still fire */ }
  }, []);

  const abortRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      try { rec.ondataavailable = null; rec.onstop = null; rec.onerror = null; } catch { /* no-op */ }
      try { rec.state !== "inactive" && rec.stop(); } catch { /* no-op */ }
      recorderRef.current = null;
      recordChunksRef.current = [];
    }
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = 0;
    setRecording(false);
    setRecordElapsed(0);
    setRingLightOn(false);
  }, []);

  const startRecording = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return { error: "Camera not ready." };
    if (recorderRef.current) return { error: "Already recording." };
    const tracks = stream.getVideoTracks();
    if (!tracks.length || tracks[0].readyState !== "live") return { error: "Camera not ready." };

    let recorder;
    try { recorder = createRecorder(stream); }
    catch (e) {
      if (e?.code === "no-mediarecorder") {
        return { error: "Video recording isn't supported in this browser." };
      }
      return { error: "This browser can't record video. Try a different browser." };
    }

    recordMimeRef.current = recorder.mimeType || pickVideoMime() || "video/webm";

    let torchLit = false;
    let ringLit = false;
    if (!isSelfie && torchSupported && flashMode === "on") {
      torchLit = await setTorch(stream, true);
    } else if (isSelfie && flashMode === "on") {
      setRingLightOn(true);
      ringLit = true;
    }

    recordChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunksRef.current, {
        type: recordMimeRef.current || recorder.mimeType || "video/webm",
      });
      recordChunksRef.current = [];
      recorderRef.current = null;
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = 0;
      if (torchLit) setTorch(streamRef.current, false).catch(() => {});
      if (ringLit) setRingLightOn(false);
      setRecording(false);
      setRecordElapsed(0);
      if (blob.size > 0) {
        setError("");
        setPending({ blob, url: URL.createObjectURL(blob), mediaType: "video" });
      } else {
        setError("Recording was empty. Try holding the button a little longer.");
      }
    };
    recorder.onerror = () => {
      setError("Recording failed. Try again.");
      abortRecording();
    };

    recorderRef.current = recorder;
    try { recorder.start(); }
    catch {
      recorderRef.current = null;
      if (torchLit) setTorch(stream, false).catch(() => {});
      if (ringLit) setRingLightOn(false);
      return { error: "Couldn't start recording. Try again." };
    }

    recordStartRef.current = Date.now();
    setRecording(true);
    setRecordElapsed(0);
    try { navigator.vibrate?.(14); } catch { /* no-op */ }
    playRecordStart();
    recordTimerRef.current = setInterval(() => {
      const ms = Date.now() - recordStartRef.current;
      setRecordElapsed(ms);
      if (ms >= VIDEO_MAX_MS) stopRecording();
    }, 200);
    return { ok: true };
  }, [isSelfie, torchSupported, flashMode, setPending, abortRecording, stopRecording]);

  // -- Cleanup on unmount -------------------------------------------------
  useEffect(() => () => {
    clearTimeout(focusTimerRef.current);
    clearTimeout(zoomTimerRef.current);
    clearTimeout(zoomHudTimerRef.current);
    abortRecording();
    if (pendingRef.current?.url) URL.revokeObjectURL(pendingRef.current.url);
  }, [abortRecording]);

  return {
    ready,
    error,
    setError,
    zoom,
    setZoom,
    resetZoom,
    visibleZoomList,
    hasHardwareZoom,
    bindPinch,
    zoomHudVisible,
    torchSupported,
    torchOn,
    toggleTorch,
    flashMode,
    cycleFlash,
    focusPoint,
    focusAt,
    retinaFlashOn,
    capturing,
    snap,
    pending,
    setPending,
    retake,
    recording,
    recordElapsed,
    ringLightOn,
    startRecording,
    stopRecording,
    abortRecording,
    resumePreview,
  };
}
