import { useCallback, useEffect, useRef, useState } from "react";
import { FOCUS_RING_MS } from "../constants.js";

/** Selfie only — off ↔ on (retina screen flash on capture). */
const SELFIE_FLASH_CYCLE = ["off", "on"];

/** Nudge the live <video> after review — never disable the MediaStream track. */
export function resumeLivePreview(videoRef) {
  const video = videoRef?.current;
  if (!video) return;
  requestAnimationFrame(() => {
    if (video.srcObject && video.paused) {
      video.play().catch(() => {});
    }
  });
}

export function useCameraCapture({
  videoRef,
  streamRef,
  adapter,
  isSelfie,
  ready,
}) {
  const capturingRef = useRef(false);
  const focusTimerRef = useRef(0);
  const pendingRef = useRef(null);

  const [flashMode, setFlashMode] = useState("off");
  const [retinaFlashPlaying, setRetinaFlashPlaying] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [pending, setPendingState] = useState(null);

  const setPending = useCallback((value) => {
    pendingRef.current = value;
    setPendingState(value);
  }, []);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => () => {
    if (pendingRef.current?.url) URL.revokeObjectURL(pendingRef.current.url);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    adapter.terminateEncodeWorker?.();
  }, [adapter]);

  const snap = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturingRef.current) return;

    capturingRef.current = true;
    setCapturing(true);

    const useSelfieFlash = isSelfie && flashMode === "on";

    try {
      let blob;
      if (useSelfieFlash) {
        const canvas = await adapter.captureWithRetinaFlash(video, setRetinaFlashPlaying);
        if (!canvas) return;
        blob = await adapter.encodeCanvas(canvas);
      } else {
        blob = await adapter.captureStill(streamRef.current, video);
      }

      if (!blob) return;
      setPending({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      console.error("Capture failed:", err);
      setRetinaFlashPlaying(false);
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [videoRef, streamRef, adapter, isSelfie, flashMode, setPending]);

  async function focusAt(clientX, clientY) {
    const video = videoRef.current;
    if (!video) return;
    const rect = video.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setFocusPoint({ x, y, id: Date.now() });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusPoint(null), FOCUS_RING_MS);
    await adapter.focusTrackAt(streamRef.current, x, y);
  }

  function cycleSelfieFlash() {
    setFlashMode((current) => {
      const idx = SELFIE_FLASH_CYCLE.indexOf(current);
      return SELFIE_FLASH_CYCLE[(idx === -1 ? 0 : idx + 1) % SELFIE_FLASH_CYCLE.length];
    });
  }

  function retake() {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending(null);
    resumeLivePreview(videoRef);
  }

  return {
    flashMode,
    retinaFlashPlaying,
    focusPoint,
    capturing,
    pending,
    setPending,
    snap,
    focusAt,
    cycleSelfieFlash,
    retake,
    capturingRef,
  };
}
