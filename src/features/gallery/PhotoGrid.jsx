import React from "react";
import { retry } from '@/services/storage/uploadQueue.js';
import LazyImage, { LazyVideo } from '@/components/ui/LazyImage.jsx';
import PhotoAwaitPlaceholder from '@/components/ui/PhotoAwaitPlaceholder.jsx';

/**
 * Square photo grid (iPhone Photos style). Tap a tile → `onOpen(index)`.
 * Tiles are intentionally clean — the timestamp shows in the Lightbox, not
 * on the grid, so the visual rhythm of the grid stays calm. A small status
 * dot appears only when an upload is in flight or has failed.
 */
export default function PhotoGrid({ shots, onOpen }) {
  return (
    <div className="ph-grid">
      {shots.map((s, i) => (
        <button
          key={s.id}
          className="ph-tile"
          onClick={() => onOpen?.(i)}
          aria-label={s.mediaType === "video" ? "Open video" : "Open photo"}
        >
          {s.mediaType === "video" ? (
            <>
              <LazyVideo src={s.url} />
              <span className="ph-tile-badge" aria-hidden>
                <PlayGlyph />
              </span>
            </>
          ) : s.url ? (
            <LazyImage src={s.url} alt="" variant="tile" />
          ) : (
            <PhotoAwaitPlaceholder variant="tile" />
          )}
          <StatusDot shot={s} />
        </button>
      ))}
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

const DOT_LABELS = {
  pending: "Uploading…",
  failed: "Upload failed — tap to retry",
  blocked: "Not shared — this photo stays on your device",
};

function StatusDot({ shot }) {
  const { status } = shot;
  const label = DOT_LABELS[status];
  if (!label) return null;
  return (
    <span
      className={`ph-dot ph-dot-${status}`}
      role={status === "failed" ? "button" : undefined}
      title={label}
      aria-label={label}
      onClick={(e) => {
        // Only genuine failures are retryable; a moderation block is final.
        if (status !== "failed") return;
        e.stopPropagation();
        retry(shot.id);
      }}
    />
  );
}
