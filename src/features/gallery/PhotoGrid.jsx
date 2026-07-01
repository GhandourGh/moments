import React from "react";
import { retry } from '@/services/storage/uploadQueue.js';

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
              <video
                src={s.url}
                muted
                playsInline
                preload="metadata"
                // Showing the first frame as the tile thumbnail without
                // shipping a separate poster file.
              />
              <span className="ph-tile-badge" aria-hidden>
                <PlayGlyph />
              </span>
            </>
          ) : (
            <img src={s.url} alt="" loading="lazy" />
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

function StatusDot({ shot }) {
  const { status } = shot;
  if (status !== "pending" && status !== "failed") return null;
  const label = status === "pending" ? "Uploading…" : "Upload failed — tap to retry";
  return (
    <span
      className={`ph-dot ph-dot-${status}`}
      role={status === "failed" ? "button" : undefined}
      title={label}
      aria-label={label}
      onClick={(e) => {
        if (status !== "failed") return;
        e.stopPropagation();
        retry(shot.id);
      }}
    />
  );
}
