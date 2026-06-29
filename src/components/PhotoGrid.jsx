import React from "react";

/**
 * Square photo grid (iPhone Photos style). Tap a tile → `onOpen(index)`.
 * Tiles are intentionally clean — the timestamp shows in the Lightbox, not
 * on the grid, so the visual rhythm of the grid stays calm.
 */
export default function PhotoGrid({ shots, onOpen }) {
  return (
    <div className="ph-grid">
      {shots.map((s, i) => (
        <button
          key={s.id}
          className="ph-tile"
          onClick={() => onOpen?.(i)}
          aria-label="Open photo"
        >
          <img src={s.url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}
