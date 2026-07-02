import React from "react";
import { useEventContent } from '@/state/eventContent.js';

/**
 * Branded stand-in while a shot URL is still resolving (refresh / signed URL).
 * Uses event initials and date so tiles never look like broken empty frames.
 */
export default function PhotoAwaitPlaceholder({ variant = "tile", className = "" }) {
  const { initials, dateDisplay, coupleNames } = useEventContent();
  const mark = initials?.trim() || coupleNames?.trim() || "Tonight";
  const showDate = variant !== "frame" && Boolean(dateDisplay?.trim());

  return (
    <span
      className={`ph-await ph-await--${variant} ${className}`.trim()}
      aria-hidden
    >
      <span className="ph-await-mark">{mark}</span>
      {showDate && <span className="ph-await-date">{dateDisplay}</span>}
    </span>
  );
}
