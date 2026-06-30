import { useEffect, useMemo, useRef, useState } from "react";
import { usePinch } from "@use-gesture/react";

/** Fossify-style pinch acceleration — 2× zoom delta per finger spread. */
function speedUpZoomBy2X(scaleFactor) {
  if (scaleFactor > 1) return 1 + (scaleFactor - 1) * 2;
  return 1 - (1 - scaleFactor) * 2;
}

export function useCameraZoom({ nativeZoom, streamRef, adapter, ready, hasPending, recording }) {
  const [zoom, setZoom] = useState(1);
  const [zoomHudVisible, setZoomHudVisible] = useState(false);
  const zoomHudTimerRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const zoomHudRef = useRef(null);

  const hasHardwareZoom = nativeZoom && nativeZoom.max > nativeZoom.min + 0.01;
  const zoomMin = nativeZoom?.min ?? 1;
  const zoomMax = nativeZoom?.max ?? 1;
  const visibleZoomList = useMemo(
    () => (hasHardwareZoom ? adapter.visibleZoomSteps(zoomMin, zoomMax) : []),
    [hasHardwareZoom, zoomMin, zoomMax, adapter],
  );

  useEffect(() => {
    if (nativeZoom) setZoom(nativeZoom.min ?? 1);
  }, [nativeZoom]);

  const bindPinch = usePinch(
    ({ offset: [rawZoom], first, last }) => {
      if (!hasHardwareZoom) return;
      if (first) {
        pinchStartZoomRef.current = zoom;
        clearTimeout(zoomHudTimerRef.current);
        setZoomHudVisible(true);
      }
      const base = pinchStartZoomRef.current;
      const pinchRatio = base > 0 ? rawZoom / base : 1;
      const accelerated = base * speedUpZoomBy2X(pinchRatio);
      const clamped = Math.max(zoomMin, Math.min(zoomMax, accelerated));
      if (zoomHudRef.current) {
        const v = Math.round(clamped * 10) / 10;
        zoomHudRef.current.textContent = Number.isInteger(v) ? `${v}×` : `${v.toFixed(1)}×`;
      }
      setZoom(clamped);
      if (last) {
        zoomHudTimerRef.current = setTimeout(() => setZoomHudVisible(false), 900);
      }
    },
    {
      enabled: hasHardwareZoom,
      scaleBounds: { min: zoomMin, max: zoomMax },
      rubberband: true,
      from: () => [zoom, 0],
    },
  );

  useEffect(() => {
    if (!hasHardwareZoom) return;
    let cancelled = false;
    (async () => {
      const clamped = Math.max(nativeZoom.min, Math.min(nativeZoom.max, zoom));
      if (cancelled) return;
      await adapter.setNativeZoom(streamRef.current, clamped);
    })();
    return () => { cancelled = true; };
  }, [zoom, nativeZoom, hasHardwareZoom, streamRef, adapter]);

  useEffect(() => () => clearTimeout(zoomHudTimerRef.current), []);

  function resetZoom() {
    setZoom(nativeZoom?.min ?? 1);
  }

  const showHud = zoomHudVisible && hasHardwareZoom && !hasPending && !recording;

  return {
    zoom,
    setZoom,
    zoomMin,
    zoomMax,
    hasHardwareZoom,
    visibleZoomList,
    bindPinch,
    showHud,
    resetZoom,
    zoomHudRef,
  };
}
