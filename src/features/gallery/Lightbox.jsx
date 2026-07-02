import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  composeMemoryCardBlob,
  fetchAssetBlob,
  memoryCardDownloadName,
  photoExportUrl,
  plainPhotoDownloadName,
  triggerDownload,
} from '@/config/memoryCardTemplate.js';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { getEventId } from '@/services/api/index.js';

/**
 * Full-screen photo viewer.
 *
 * Close UX:
 *   - Click / tap the image (when not zoomed) → close.
 *   - Click / tap the dark area around the image → close.
 *   - × button or ESC → close.
 *   - A short fade + scale-down plays before unmount.
 *
 * Photo navigation:
 *   - Keyboard ←/→ steps; swipe steps (only when image is at natural size).
 *   - Prev / next chevrons are always visible (mobile too).
 *
 * Pinch-zoom:
 *   - Two-finger pinch 1x → 4x; one-finger drag pans when zoomed in.
 *   - Double-tap toggles 1x ↔ 2x.
 *   - Transform resets when photo index changes.
 */
function videoDownloadName(shot) {
  // Pick an extension that matches the MIME we recorded with, falling back
  // to the URL hash if the blob's lost its type along the way.
  const ext = "webm";
  const base = shot?.id ? `tonight-${shot.id}` : "tonight";
  return `${base}.${ext}`;
}

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const TAP_PX = 8;     // movement threshold to disqualify a tap
const TAP_MS = 300;   // max duration of a tap
const CLOSE_MS = 180; // close animation duration

export default function Lightbox({ shots, index, onClose, onIndexChange }) {
  const total = shots.length;
  const current = shots[index];

  const rootRef = useRef(null);
  const imgRef = useRef(null);
  useFocusTrap(rootRef, true);
  const { show } = useToast();

  // Smooth-close: render the overlay with an exiting class, then unmount.
  const [closing, setClosing] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [originalBusy, setOriginalBusy] = useState(false);
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }, [closing, onClose]);

  // --- transform state ---
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const scaleRef = useRef(1);
  scaleRef.current = t.s;

  // Marks a continuous gesture in progress (wheel / pinch / pan) so the
  // CSS transition stays out of the way. Cleared shortly after the last
  // event of the gesture. Using a ref instead of state means toggling it
  // doesn't itself cause a render.
  const interactingRef = useRef(false);
  const interactingClearTimer = useRef(0);
  function markInteracting() {
    interactingRef.current = true;
    if (interactingClearTimer.current) clearTimeout(interactingClearTimer.current);
    interactingClearTimer.current = setTimeout(() => {
      interactingRef.current = false;
    }, 140);
  }

  useEffect(() => { setT({ s: 1, x: 0, y: 0 }); }, [index, current?.id]);

  // --- pointer tracking ---
  const pointers = useRef(new Map()); // pointerId -> { x, y }
  const pinch = useRef(null);
  const pan = useRef(null);
  const tap = useRef(null);   // tracks a possible tap-to-close gesture
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      pan.current = { startX: e.clientX, startY: e.clientY, x0: t.x, y0: t.y };
      tap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };

      // Double-tap toggles zoom. When it fires, also suppress tap-to-close.
      const now = Date.now();
      const dx = e.clientX - lastTap.current.x;
      const dy = e.clientY - lastTap.current.y;
      if (now - lastTap.current.t < 300 && Math.hypot(dx, dy) < 30) {
        setT((cur) => (cur.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2, x: 0, y: 0 }));
        lastTap.current = { t: 0, x: 0, y: 0 };
        tap.current = null;
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const img = imgRef.current;
      // Resolve the image-local point currently under the pinch midpoint so
      // we can keep that point pinned as the gesture moves + scales.
      let px = 0, py = 0;
      if (img) {
        const rect = img.getBoundingClientRect();
        const cx0 = rect.left + rect.width / 2;
        const cy0 = rect.top + rect.height / 2;
        px = (midX - cx0 - t.x) / t.s;
        py = (midY - cy0 - t.y) / t.s;
      }
      pinch.current = {
        dist: distance(pts[0], pts[1]),
        s0: t.s,
        px, py,
      };
      pan.current = null;
      tap.current = null;
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Any meaningful movement disqualifies this as a tap.
    if (tap.current && tap.current.id === e.pointerId) {
      const dx = e.clientX - tap.current.x;
      const dy = e.clientY - tap.current.y;
      if (Math.hypot(dx, dy) > TAP_PX) tap.current = null;
    }

    if (pointers.current.size === 2 && pinch.current) {
      markInteracting();
      const pts = [...pointers.current.values()];
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const d = distance(pts[0], pts[1]);
      const s = clamp(pinch.current.s0 * (d / pinch.current.dist), MIN_SCALE, MAX_SCALE);
      const img = imgRef.current;
      if (img) {
        const rect = img.getBoundingClientRect();
        const cx0 = rect.left + rect.width / 2;
        const cy0 = rect.top + rect.height / 2;
        const x = midX - cx0 - s * pinch.current.px;
        const y = midY - cy0 - s * pinch.current.py;
        setT({ s, x, y });
      } else {
        setT({ s, x: t.x, y: t.y });
      }
      return;
    }

    if (pointers.current.size === 1 && pan.current && t.s > 1) {
      markInteracting();
      const dx = e.clientX - pan.current.startX;
      const dy = e.clientY - pan.current.startY;
      setT({ s: t.s, x: pan.current.x0 + dx, y: pan.current.y0 + dy });
    }
  }

  function onPointerUp(e) {
    const wasTap =
      tap.current &&
      tap.current.id === e.pointerId &&
      Date.now() - tap.current.t < TAP_MS;

    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;

    // Tap on the image (at natural size, no other pointers) closes the viewer.
    if (wasTap && scaleRef.current === 1 && pointers.current.size === 0) {
      tap.current = null;
      requestClose();
    } else {
      tap.current = null;
    }
  }

  // --- wheel / trackpad-pinch zoom (so this is testable on a laptop) ---
  // Mac trackpad pinch → wheel events with ctrlKey=true (browser convention).
  // Plain mouse wheel also zooms, just slower. Either way, zoom is anchored
  // at the cursor so the point under the cursor stays put.
  function zoomAt(clientX, clientY, factor) {
    setT((cur) => {
      const img = imgRef.current;
      if (!img) return cur;
      const rect = img.getBoundingClientRect();
      const cx0 = rect.left + rect.width / 2;
      const cy0 = rect.top + rect.height / 2;
      const oldS = cur.s;
      const newS = clamp(oldS * factor, MIN_SCALE, MAX_SCALE);
      if (newS === oldS) return cur;
      const px = (clientX - cx0 - cur.x) / oldS;
      const py = (clientY - cy0 - cur.y) / oldS;
      let nx = clientX - cx0 - newS * px;
      let ny = clientY - cy0 - newS * py;
      if (newS === 1) { nx = 0; ny = 0; }
      return { s: newS, x: nx, y: ny };
    });
  }

  // React's onWheel is passive; we need preventDefault, so bind manually.
  // We also coalesce multiple wheel events per animation frame so a fast
  // trackpad pinch doesn't fire 5–10 renders per frame.
  useEffect(() => {
    const node = imgRef.current;
    if (!node) return;
    let frame = 0;
    let pending = null; // { x, y, dy, ctrlKey } — accumulates deltaY within a frame
    function flush() {
      frame = 0;
      const w = pending;
      pending = null;
      if (!w) return;
      const intensity = w.ctrlKey ? 0.01 : 0.003;
      const factor = Math.exp(-w.dy * intensity);
      zoomAt(w.x, w.y, factor);
    }
    function onWheel(e) {
      e.preventDefault();
      markInteracting();
      if (!pending) pending = { x: e.clientX, y: e.clientY, dy: 0, ctrlKey: e.ctrlKey };
      pending.dy += e.deltaY;
      pending.x = e.clientX;
      pending.y = e.clientY;
      pending.ctrlKey = e.ctrlKey;
      if (!frame) frame = requestAnimationFrame(flush);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // --- swipe between photos (only when not zoomed) ---
  const swipeStart = useRef(null);
  function onTouchStart(e) {
    if (scaleRef.current > 1) { swipeStart.current = null; return; }
    swipeStart.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e) {
    if (swipeStart.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? swipeStart.current) - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) < 40) return;
    step(dx < 0 ? 1 : -1);
  }

  // --- keyboard ---
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") requestClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  function step(delta) {
    if (total <= 1) return;
    const next = (index + delta + total) % total;
    onIndexChange?.(next);
  }

  const keepsakeName = current?.id
    ? memoryCardDownloadName(current.id)
    : memoryCardDownloadName();

  const plainName = current?.id
    ? plainPhotoDownloadName(current.id)
    : plainPhotoDownloadName();

  async function downloadKeepsake() {
    if (cardBusy) return;
    const exportSrc = current?.serverId
      ? photoExportUrl(getEventId(), current.serverId)
      : current?.url;
    if (!exportSrc) {
      show("Photo still loading — try again in a moment", { duration: 4000 });
      return;
    }
    setCardBusy(true);
    try {
      const blob = await composeMemoryCardBlob(exportSrc);
      await triggerDownload(blob, keepsakeName);
    } catch {
      show("Couldn't save this moment — try again", { duration: 5000 });
    } finally {
      setCardBusy(false);
    }
  }

  async function downloadOriginal() {
    if (originalBusy) return;
    const video = current?.mediaType === "video";
    const src = !video && current?.serverId
      ? photoExportUrl(getEventId(), current.serverId)
      : current?.url;
    if (!src) {
      show("Still loading — try again in a moment", { duration: 4000 });
      return;
    }
    setOriginalBusy(true);
    try {
      const blob = await fetchAssetBlob(src);
      const name = video ? videoDownloadName(current) : plainName;
      await triggerDownload(blob, name);
    } catch {
      show("Couldn't download — try again", { duration: 5000 });
    } finally {
      setOriginalBusy(false);
    }
  }

  // Web Share API — only render the button when the platform can share
  // a File. Falls back silently to the existing Original / Keepsake when
  // the browser can't (desktop Chrome, Firefox, etc.).
  const [shareBusy, setShareBusy] = useState(false);
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function";

  async function shareCurrent() {
    if (!current?.url || shareBusy || !canShareFiles) return;
    setShareBusy(true);
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const file = new File([blob], plainName, { type: blob.type || "image/jpeg" });
      if (!navigator.canShare({ files: [file] })) return;
      await navigator.share({ files: [file], title: "A moment from tonight" });
    } catch {
      /* user cancel or share unsupported — no toast needed */
    } finally {
      setShareBusy(false);
    }
  }

  const timeLabel = current?.takenAt
    ? new Date(current.takenAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  // Attribution: guest-captured shots show "by First Last". Seed / album shots
  // have no guest and render as "Album" so the byline row always sits in the
  // same place — no layout shift when navigating the lightbox.
  const attributionLabel = current
    ? current.guestFirstName || current.guestLastName
      ? `by ${[current.guestFirstName, current.guestLastName].filter(Boolean).join(" ")}`
      : current.seed ? "Album" : null
    : null;

  if (!current) return null;

  const isVideo = current.mediaType === "video";
  const zoomed = t.s > 1;

  return (
    <div
      ref={rootRef}
      className={`lb ${closing ? "lb-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={requestClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="lb-top" onClick={(e) => e.stopPropagation()}>
        <span className="lb-counter">{index + 1} / {total}</span>
        <div className="lb-meta">
          {attributionLabel && (
            <span className="lb-by">{attributionLabel}</span>
          )}
          {timeLabel && (
            <span className="lb-time" aria-label={`Captured at ${timeLabel}`}>
              <ClockIcon />
              {timeLabel}
            </span>
          )}
        </div>
        <button className="lb-close" onClick={requestClose} aria-label="Close">
          <CloseIcon />
        </button>
      </header>

      <div className="lb-stage">
        {total > 1 && !zoomed && (
          <button
            className="lb-nav lb-nav-prev"
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Previous photo"
          >
            <ChevronIcon dir="left" />
          </button>
        )}

        {isVideo ? (
          <video
            className="lb-video"
            src={current.url}
            controls
            playsInline
            autoPlay
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            ref={imgRef}
            className="lb-img"
            src={current.url}
            alt=""
            draggable={false}
            // Stop click bubbling — we handle close via pointerup so the
            // movement-vs-tap distinction stays clean.
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.s})`,
              // No transition during a continuous gesture (wheel / pinch / pan)
              // — that's what was making zoom feel shaky.
              transition:
                pointers.current.size || interactingRef.current
                  ? "none"
                  : "transform 0.18s ease",
              cursor: zoomed ? "grab" : "zoom-out",
              touchAction: "none",
              willChange: "transform",
            }}
          />
        )}

        {total > 1 && !zoomed && (
          <button
            className="lb-nav lb-nav-next"
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next photo"
          >
            <ChevronIcon dir="right" />
          </button>
        )}
      </div>

      <footer className="lb-footer" onClick={(e) => e.stopPropagation()}>
        {!isVideo && zoomed && (
          <button
            type="button"
            className="lb-download lb-reset"
            onClick={() => setT({ s: 1, x: 0, y: 0 })}
          >
            Reset zoom
          </button>
        )}
        <div className="lb-downloads">
          {canShareFiles && (
            <button
              type="button"
              className="lb-download"
              onClick={shareCurrent}
              disabled={shareBusy}
              aria-label={isVideo ? "Share this video" : "Share this photo"}
            >
              <ShareIcon />
              <span>{shareBusy ? "Sharing…" : "Share"}</span>
            </button>
          )}
          <button
            type="button"
            className="lb-download"
            onClick={downloadOriginal}
            disabled={originalBusy || !(current.url || current.serverId)}
            aria-label={isVideo ? "Download original video" : "Download original photo"}
          >
            <DownloadIcon />
            <span>{originalBusy ? "Downloading…" : "Original"}</span>
          </button>
          {!isVideo && (
            <button
              type="button"
              className="lb-download lb-download-card"
              onClick={downloadKeepsake}
              disabled={cardBusy || !(current.url || current.serverId)}
              aria-label="Save moment with initials and date"
            >
              <CardIcon />
              <span>{cardBusy ? "Saving…" : "Save Moment"}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------- Icons ----------------------------- */

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

function ChevronIcon({ dir }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16" />
      <path d="M8 15h8" />
    </svg>
  );
}
