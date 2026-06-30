import { useEffect, useRef, useState } from "react";
import { createWebCameraAdapter } from "../adapters/WebCameraAdapter.js";

const adapter = createWebCameraAdapter();

export function useCameraStream({ facing, mode = "photo", videoRef, permissionGate = false }) {
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [nativeZoom, setNativeZoomCaps] = useState(null);

  useEffect(() => {
    if (permissionGate) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setReady(false);

    async function start() {
      try {
        const stream = await adapter.openStream({ facing, mode });
        if (cancelled) {
          adapter.stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setTorchSupported(adapter.getTorchSupported(stream));
        const zoomCaps = await adapter.probeNativeZoom(stream);
        if (cancelled) return;
        setNativeZoomCaps(zoomCaps);
        if (videoRef.current) {
          await adapter.attachStreamToVideo(stream, videoRef.current);
          if (cancelled) return;
          setReady(true);
          setError("");
        }
      } catch (e) {
        if (cancelled) return;
        if (e?.code === "insecure-context") {
          setError(
            "The camera needs a secure connection. Open this app with https:// (not http://) — " +
            "the dev server prints an https Network URL."
          );
        } else if (e?.code === "unsupported") {
          setError("This browser doesn't support the in-app camera.");
        } else if (e?.name === "NotAllowedError") {
          setError(
            "Camera access was denied. Allow it in your browser settings, or choose a photo from your library below."
          );
        } else {
          setError(
            "Couldn't open the camera on this device. You can still choose a photo from your library."
          );
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      adapter.setTorch(streamRef.current, false).catch(() => {});
      if (streamRef.current) {
        adapter.stopStream(streamRef.current);
        streamRef.current = null;
      }
    };
  }, [facing, mode, videoRef, permissionGate]);

  return { streamRef, ready, error, setError, torchSupported, nativeZoom, adapter };
}
