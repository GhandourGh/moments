import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import { downscaleImageFile } from '@/features/camera/capture.js';
import { useCamera } from '@/features/camera/useCamera.js';

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatZoomLabel(step) {
  if (step < 1) return `.${String(step).split(".")[1] || "5"}`;
  return Number.isInteger(step) ? String(step) : step.toFixed(1);
}

function isVolumeShutterKey(e) {
  const { key, code } = e;
  return (
    key === "AudioVolumeUp" || key === "AudioVolumeDown" ||
    key === "VolumeUp" || key === "VolumeDown" ||
    code === "AudioVolumeUp" || code === "AudioVolumeDown" ||
    code === "VolumeUp" || code === "VolumeDown" ||
    e.keyCode === 175 || e.keyCode === 176
  );
}

export default function CameraView({
  onCapture,
  onClose,
  onViewLastPhoto,
  lastPhotoUrl = null,
  photoCount = 0,
  defaultFacing = "environment",
  closeOnCapture = false,
  allowVideo = true,
}) {
  const videoRef = useRef(null);
  const rootRef = useRef(null);
  const fileRef = useRef(null);
  const snapRef = useRef(() => {});

  const [facing, setFacing] = useState(defaultFacing);
  const [mode, setMode] = useState("photo");
  const [permissionGate, setPermissionGate] = useState(true);

  useFocusTrap(rootRef, true);
  const isSelfie = facing === "user";

  const {
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
  } = useCamera({ videoRef, facing, mode, permissionGate, isSelfie });

  // Skip the pre-permission explainer if camera was already granted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: "camera" });
        if (!cancelled && status.state === "granted") setPermissionGate(false);
        status.onchange = () => {
          if (status.state === "granted") setPermissionGate(false);
        };
      } catch { /* Permissions API unsupported */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stop any in-flight recording when facing or mode changes.
  useEffect(() => () => abortRecording(), [facing, mode, abortRecording]);

  // Volume-key shutter + Escape to close.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { onClose(); return; }
      if (!isVolumeShutterKey(e)) return;
      if (!ready || pending || error || mode !== "photo" || recording || capturing) return;
      e.preventDefault();
      e.stopPropagation();
      snapRef.current();
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [ready, pending, error, mode, recording, capturing, onClose]);
  snapRef.current = snap;

  function flipCamera() {
    resetZoom();
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  function keep() {
    if (!pending) return;
    const mediaType = pending.mediaType || "photo";
    const added = onCapture(pending.blob, { mediaType });
    if (!added || added.url !== pending.url) URL.revokeObjectURL(pending.url);
    setPending(null);
    resumePreview();
    if (closeOnCapture) onClose();
  }

  function openLibrary() {
    fileRef.current?.click();
  }

  async function onLibraryPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (pending?.url) URL.revokeObjectURL(pending.url);
    const blob = await downscaleImageFile(file);
    setPending({ blob, url: URL.createObjectURL(blob) });
    setError("");
    setPermissionGate(false);
  }

  function requestCameraAccess() {
    setPermissionGate(false);
    setError("");
  }

  async function handleShutterClick() {
    if (mode === "video") {
      if (recording) stopRecording();
      else {
        const result = await startRecording();
        if (result?.error) setError(result.error);
      }
    } else {
      snap();
    }
  }

  const videoModeActive = mode === "video";

  return (
    <motion.div
      className="cam"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      ref={rootRef}
      {...bindPinch()}
      style={{ touchAction: "none" }}
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="cam-file-input"
        onChange={onLibraryPick}
        aria-hidden
        tabIndex={-1}
      />

      <video
        ref={videoRef}
        className={
          "cam-video" +
          (ready ? "" : " cam-video--not-ready") +
          (isSelfie ? " cam-video--mirror" : "") +
          (pending ? " cam-video--behind-review" : "")
        }
        playsInline
        muted
        autoPlay
        onClick={(e) => !pending && focusAt(e.clientX, e.clientY)}
      />

      {isSelfie && (
        <div
          className={`cam-screen-flash${retinaFlashOn ? " cam-screen-flash--active" : ""}`}
          aria-hidden
        />
      )}
      <div
        className={`cam-ring-light${ringLightOn ? " cam-ring-light--on" : ""}`}
        aria-hidden
      />
      {focusPoint && (
        <span
          key={focusPoint.id}
          className="cam-focus-ring"
          style={{
            left: `${focusPoint.x * 100}%`,
            top: `${focusPoint.y * 100}%`,
          }}
          aria-hidden
        />
      )}
      <div
        className={
          `cam-zoom-hud tabular-nums${zoomHudVisible && hasHardwareZoom && !pending && !recording ? "" : " cam-zoom-hud--hidden"}`
        }
        aria-live="polite"
        aria-atomic="true"
      >
        {(() => {
          const v = Math.round(zoom * 10) / 10;
          return Number.isInteger(v) ? `${v}×` : `${v.toFixed(1)}×`;
        })()}
      </div>

      {pending && pending.mediaType === "video" ? (
        <video
          className={"cam-preview" + (isSelfie ? " cam-preview--mirror" : "")}
          src={pending.url}
          controls
          playsInline
          autoPlay
          loop
        />
      ) : pending ? (
        <img
          className={"cam-preview" + (isSelfie ? " cam-preview--mirror" : "")}
          src={pending.url}
          alt="Captured photo"
        />
      ) : null}

      {recording && (
        <div className="cam-rec-badge" aria-live="polite">
          <span className="cam-rec-dot" aria-hidden />
          <span>{formatElapsed(recordElapsed)}</span>
        </div>
      )}

      <div className="cam-top">
        <div className="cam-top-start">
          <button
            className="cam-icon-btn"
            onClick={pending ? retake : onClose}
            disabled={recording}
            aria-label={pending ? "Discard" : "Close camera"}
          >
            <CloseGlyph />
          </button>
          {!pending && !error && !permissionGate && isSelfie && !recording && (
            <button
              type="button"
              className={`cam-icon-btn cam-flash-btn cam-flash-btn--${flashMode}`}
              onClick={cycleFlash}
              aria-label={`Flash ${flashMode}`}
              title={`Flash: ${flashMode}`}
            >
              <FlashGlyph mode={flashMode} />
            </button>
          )}
          {!pending && !error && !permissionGate && torchSupported && !isSelfie && !recording && (
            <>
              <button
                type="button"
                className={`cam-icon-btn cam-torch-btn${torchOn ? " cam-torch-btn--on" : ""}`}
                onClick={toggleTorch}
                aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                title={torchOn ? "Torch on" : "Torch off"}
              >
                <TorchGlyph on={torchOn} />
              </button>
              <button
                type="button"
                className={`cam-icon-btn cam-flash-btn cam-flash-btn--${flashMode}`}
                onClick={cycleFlash}
                aria-label={`Flash ${flashMode}`}
                title={`Flash: ${flashMode}`}
              >
                <FlashGlyph mode={flashMode} />
              </button>
            </>
          )}
        </div>
      </div>

      {permissionGate && !pending ? (
        <div className="cam-permission">
          <div className="cam-permission-icon" aria-hidden>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </div>
          <h2 className="cam-permission-title">Camera access</h2>
          <p className="cam-permission-copy">
            MOMENTS needs your camera to capture photos for tonight&apos;s album.
            Your shots stay on this device until you choose to share them.
          </p>
          <button
            type="button"
            className="cam-review-btn cam-review-primary cam-permission-cta"
            onClick={requestCameraAccess}
          >
            Continue
          </button>
          <button
            type="button"
            className="cam-permission-skip"
            onClick={openLibrary}
          >
            Choose from library instead
          </button>
        </div>
      ) : error && !pending ? (
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
          <div className="cam-bottom-row">
            <div className="cam-bottom-side">
              {lastPhotoUrl && onViewLastPhoto && !recording && (
                <button
                  type="button"
                  className="cam-last-photo"
                  onClick={onViewLastPhoto}
                  aria-label={photoCount > 0 ? `View gallery (${photoCount} photo${photoCount === 1 ? "" : "s"})` : "View last photo"}
                  title="Last photo"
                >
                  <img src={lastPhotoUrl} alt="" />
                  {photoCount > 0 && (
                    <span className="cam-last-photo-count tabular-nums" aria-hidden>
                      {photoCount > 99 ? "99+" : photoCount}
                    </span>
                  )}
                </button>
              )}
            </div>
            <div className="cam-bottom-center">
              {visibleZoomList.length > 1 && !recording && (
                <CamZoomPill
                  zoom={zoom}
                  steps={visibleZoomList}
                  onChange={setZoom}
                />
              )}

              <button
                className={
                  "cam-shutter" +
                  (mode === "video" ? " cam-shutter--video" : "") +
                  (recording ? " cam-shutter--recording" : "")
                }
                type="button"
                onClick={handleShutterClick}
                disabled={!ready || capturing || (videoModeActive && !ready)}
                aria-label={
                  mode === "video"
                    ? (recording ? "Stop recording" : "Record video")
                    : "Take photo"
                }
              >
                <span className="cam-shutter-inner" />
              </button>

              {!recording && allowVideo && (
                <div
                  className={`cam-mode-toggle cam-mode-toggle--${mode}`}
                  role="tablist"
                  aria-label="Capture mode"
                >
                  <span className="cam-mode-thumb" aria-hidden />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "photo"}
                    className={`cam-mode-opt${mode === "photo" ? " cam-mode-opt--on" : ""}`}
                    onClick={() => {
                      if (mode !== "photo") { setError(""); setMode("photo"); }
                    }}
                  >
                    Photo
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "video"}
                    className={`cam-mode-opt${mode === "video" ? " cam-mode-opt--on" : ""}`}
                    onClick={() => {
                      if (mode !== "video") { setError(""); setMode("video"); }
                    }}
                  >
                    Video
                  </button>
                </div>
              )}
            </div>
            <div className="cam-bottom-side cam-bottom-side--end">
              {!pending && !error && !recording && (
                <button
                  type="button"
                  className="cam-icon-btn cam-flip-btn"
                  onClick={flipCamera}
                  aria-label="Flip camera"
                  title="Flip camera"
                >
                  <FlipGlyph />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CamZoomPill({ zoom, steps, onChange }) {
  return (
    <div className="cam-zoom-pill" role="radiogroup" aria-label="Zoom">
      {steps.map((step) => {
        const active = Math.abs(zoom - step) < 0.08;
        return (
          <button
            key={step}
            type="button"
            role="radio"
            aria-checked={active}
            className={`cam-zoom-step${active ? " cam-zoom-step--active" : ""}`}
            onClick={() => onChange(step)}
            title={`${step}× zoom`}
          >
            {formatZoomLabel(step)}
          </button>
        );
      })}
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function FlipGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h10a4 4 0 0 1 4 4v1" />
      <path d="M7 4 4 7l3 3" />
      <path d="M20 17H10a4 4 0 0 1-4-4v-1" />
      <path d="M17 20l3-3-3-3" />
    </svg>
  );
}

const FLASH_GLYPH_TRANSITION = { type: "spring", duration: 0.3, bounce: 0 };

function TorchGlyph({ on }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path
        d="M9 18h6M10 22h4M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M19.07 4.93l-1.41 1.41M22 12h-2M19.07 19.07l-1.41-1.41"
        opacity={0.55}
      />
      <path
        d="M12 6a4 4 0 0 0-2 7.46V16h4v-2.54A4 4 0 0 0 12 6z"
        fill={on ? "currentColor" : "none"}
        opacity={on ? 1 : 0.85}
      />
    </svg>
  );
}

function FlashGlyph({ mode }) {
  const bolt = "M13 2 4 14h7l-1 8 10-14h-7l0-6z";
  return (
    <span className="cam-flash-glyph" aria-hidden>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={mode}
          className="cam-flash-glyph-inner"
          initial={{ opacity: 0, scale: 0.25 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.25 }}
          transition={FLASH_GLYPH_TRANSITION}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path
              d={bolt}
              fill={mode === "off" ? "none" : "currentColor"}
              opacity={mode === "off" ? 0.85 : 1}
            />
            {mode === "off" && (
              <path d="M5 4l14 16" strokeWidth="1.6" />
            )}
          </svg>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
