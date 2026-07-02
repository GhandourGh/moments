import React, { useEffect, useId, useRef, useState } from "react";
import { adminUploadHeroImage } from '@/services/api/index.js';

/** Resize + re-encode before upload — keeps hero fast on mobile guest pages. */
async function prepareHeroBlob(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1920;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

/**
 * Hero / cover photo picker — uploads via POST /api/events/:id/cover and
 * returns a storage key for events.content.heroStorageKey.
 */
export default function HeroCoverField({
  value,
  previewUrl,
  onChange,
  onUploaded,
  eventId,
  passcode,
  onPendingFile,
  variant = "host",
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const [preview, setPreview] = useState(previewUrl || "");
  const [imgBroken, setImgBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const isAdmin = variant === "admin";

  useEffect(() => {
    setPreview(previewUrl || "");
    setImgBroken(false);
  }, [previewUrl]);

  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  async function uploadFile(file) {
    if (!file?.type?.startsWith("image/")) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }

    setError("");
    setImgBroken(false);
    setBusy(true);
    try {
      const blob = await prepareHeroBlob(file);
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));

      if (eventId && passcode) {
        const res = await adminUploadHeroImage(eventId, blob, passcode);
        onChange(res.storageKey);
        setPreview(res.url);
        setPendingName("");
        onPendingFile?.(null);
        onUploaded?.({ storageKey: res.storageKey, url: res.url });
      } else {
        onPendingFile?.(blob);
        setPendingName(file.name);
        onChange("");
      }
    } catch (err) {
      setError(err.message || "Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  }

  function clearImage() {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview("");
    setPendingName("");
    setImgBroken(false);
    onChange("");
    onPendingFile?.(null);
    onUploaded?.(null);
    setError("");
  }

  const canUploadNow = Boolean(eventId && passcode);
  const hasPreview = Boolean(preview || pendingName);
  const showBroken = hasPreview && preview && imgBroken;
  const rootClass = `hero-cover hero-cover--${variant}${dragOver ? " is-dragover" : ""}${busy ? " is-busy" : ""}`;

  return (
    <div className={rootClass} ref={rootRef}>
      {isAdmin && (
        <div className="hero-cover-head">
          <div>
            <p className="hero-cover-eyebrow">Guest page background</p>
            <p className="hero-cover-hint">
              This fills the full screen behind the event title on Tonight.
              Saves automatically when you pick a file.
            </p>
          </div>
          {hasPreview && value && !busy && (
            <span className="hero-cover-badge">Live</span>
          )}
        </div>
      )}

      {!isAdmin && (
        <span className="wm-field-label">
          Hero cover photo<em className="host-hint"> — full-screen background</em>
        </span>
      )}

      {hasPreview ? (
        <div className="hero-cover-preview">
          <div className="hero-cover-frame">
            {preview && !showBroken ? (
              <img
                src={preview}
                alt="Hero cover preview"
                onError={() => setImgBroken(true)}
              />
            ) : (
              <div className="hero-cover-fallback">
                {showBroken ? (
                  <>
                    <p>Preview couldn't load.</p>
                    <button type="button" className="btn btn-text" onClick={() => inputRef.current?.click()}>
                      Upload again
                    </button>
                  </>
                ) : (
                  <span>{pendingName}</span>
                )}
              </div>
            )}
            {busy && <div className="hero-cover-busy" aria-live="polite">Uploading…</div>}
          </div>
          <div className="hero-cover-actions">
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={() => inputRef.current?.click()}>
              {busy ? "Uploading…" : "Replace image"}
            </button>
            <button type="button" className="btn btn-text" disabled={busy} onClick={clearImage}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="hero-cover-drop"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="hero-cover-drop-icon" aria-hidden>
            <ImageIcon />
          </span>
          <span className="hero-cover-drop-title">
            {busy ? "Uploading…" : isAdmin ? "Drop a cover photo here" : "Choose from your files"}
          </span>
          <span className="hero-cover-drop-sub">
            {isAdmin ? "or click to browse · JPEG, PNG, WebP · up to 5 MB" : "JPEG, PNG, or WebP"}
          </span>
        </button>
      )}

      {!canUploadNow && !hasPreview && !isAdmin && (
        <p className="host-content-note">
          For a new event, pick an image now — it uploads right after you create the event.
        </p>
      )}
      {pendingName && !canUploadNow && !isAdmin && (
        <p className="host-content-note">Ready to upload: {pendingName}</p>
      )}
      {error && <p className="hero-cover-error" role="alert">{error}</p>}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hero-cover-input"
        onChange={onPick}
      />
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L7 17" />
    </svg>
  );
}
