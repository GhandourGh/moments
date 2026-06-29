import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import CamSessionStack from "./CamSessionStack.jsx";

/**
 * In-app camera. Keep adds to the gallery AND a session stack beside the
 * shutter — camera stays open so guests can capture multiple shots.
 */
export default function CameraView({
  onCapture,
  onUndoCapture,
  onClose,
  defaultFacing = "environment",
  showSessionStack = true,
  closeOnCapture = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rootRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState(defaultFacing);
  const [pending, setPending] = useState(null);
  const [session, setSession] = useState([]);
  const [lastAddedId, setLastAddedId] = useState(null);
  useFocusTrap(rootRef, true);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!window.isSecureContext) {
        setError(
          "The camera needs a secure connection. Open this app with https:// (not http://) — " +
          "the dev server prints an https Network URL."
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser doesn't support the in-app camera.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
          setError("");
        }
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera access was denied. Allow it in your browser settings, or choose a photo from your library below."
            : "Couldn't open the camera on this device. You can still choose a photo from your library."
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [facing]);

  useEffect(() => {
    return () => {
      if (pending?.url) URL.revokeObjectURL(pending.url);
      session.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPending({ blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.92
    );
  }

  function retake() {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    setPending(null);
  }

  function addToSession(blob, previewUrl) {
    const added = onCapture(blob);
    if (!added) return;
    const { id, url } = added;
    if (previewUrl && previewUrl !== url) URL.revokeObjectURL(previewUrl);
    setSession((prev) => [{ id, url, takenAt: Date.now() }, ...prev]);
    setLastAddedId(id);
    try { navigator.vibrate?.(10); } catch { /* no-op */ }
  }

  function keep() {
    if (!pending) return;
    if (showSessionStack) {
      addToSession(pending.blob, pending.url);
      setPending(null);
    } else {
      const added = onCapture(pending.blob);
      if (!added || added.url !== pending.url) {
        URL.revokeObjectURL(pending.url);
      }
      setPending(null);
      if (closeOnCapture) onClose();
    }
  }

  function handleUndo(id) {
    setSession((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });
    setLastAddedId(null);
    onUndoCapture?.(id);
  }

  function openLibrary() {
    fileRef.current?.click();
  }

  function onLibraryPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (pending?.url) URL.revokeObjectURL(pending.url);
    const url = URL.createObjectURL(file);
    setPending({ blob: file, url });
    setError("");
  }

  return (
    <div className="cam" role="dialog" aria-modal="true" aria-label="Camera" ref={rootRef}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="cam-file-input"
        onChange={onLibraryPick}
        aria-hidden
        tabIndex={-1}
      />

      <video ref={videoRef} className="cam-video" playsInline muted />
      {pending && (
        <img className="cam-preview" src={pending.url} alt="Captured photo" />
      )}

      {showSessionStack && (
        <CamSessionStack
          items={session}
          lastAddedId={lastAddedId}
          onUndo={handleUndo}
          hidden={!!pending}
        />
      )}

      <div className="cam-top">
        <button
          className="cam-icon-btn"
          onClick={pending ? retake : onClose}
          aria-label={pending ? "Discard photo" : "Close camera"}
        >×</button>
        {!pending && !error && (
          <button
            className="cam-icon-btn"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="Flip camera"
            title="Flip camera"
          >⤾</button>
        )}
      </div>

      {error && !pending ? (
        <div className="cam-error">
          <p>{error}</p>
          <div className="cam-error-actions">
            <button type="button" className="cam-review-btn cam-review-primary" onClick={openLibrary}>
              Choose from library
            </button>
            <button type="button" className="cam-review-btn cam-review-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : pending ? (
        <div className="cam-review">
          <button className="cam-review-btn cam-review-secondary" onClick={retake}>
            Retake
          </button>
          <button className="cam-review-btn cam-review-primary" onClick={keep}>
            Keep
          </button>
        </div>
      ) : (
        <div className="cam-bottom">
          <button
            className="cam-shutter"
            onClick={snap}
            disabled={!ready}
            aria-label="Take photo"
          >
            <span className="cam-shutter-inner" />
          </button>
          <button type="button" className="cam-library-link" onClick={openLibrary}>
            Choose from library
          </button>
        </div>
      )}
    </div>
  );
}
