import React from "react";
import { useEventContent } from '@/state/eventContent.js';
import PhotoAwaitPlaceholder from '@/components/ui/PhotoAwaitPlaceholder.jsx';

/**
 * Branded keepsake frame — couple initials + wedding date under the photo.
 * Canvas export layout lives in `memoryCardTemplate.js`.
 *
 * @param {object} props
 * @param {{ url: string, id?: string, takenAt?: number }} props.shot
 * @param {'button'|'article'} [props.as='article']
 * @param {string} [props.className]
 * @param {React.CSSProperties} [props.style]
 * @param {() => void} [props.onClick]
 */
export default function MemoryCard({
  shot,
  as = "article",
  className = "",
  style,
  onClick,
}) {
  const { initials, dateDisplay } = useEventContent();
  const Tag = as === "button" ? "button" : "article";
  const isButton = as === "button";

  return (
    <Tag
      className={`mem-card ${className}`.trim()}
      style={style}
      {...(isButton
        ? { type: "button", onClick, "aria-label": `View memory from ${dateDisplay}` }
        : {})}
    >
      <div className="mem-card-photo">
        {shot.url ? (
          <img src={shot.url} alt="" draggable={false} loading="lazy" />
        ) : (
          <PhotoAwaitPlaceholder variant="frame" />
        )}
      </div>
      <footer className="mem-card-foot">
        <span className="mem-card-rule" aria-hidden />
        <p className="mem-card-initials">{initials}</p>
        <p className="mem-card-date">{dateDisplay}</p>
      </footer>
    </Tag>
  );
}
