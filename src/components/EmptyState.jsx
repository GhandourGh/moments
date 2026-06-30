import React from "react";

/**
 * Shared empty-state card. Replaces the old dashed-border `.placeholder`
 * with intentional editorial composition: a brand-stroked glyph, a serif
 * headline, a sentence of subhead, and an optional CTA.
 *
 * Usage:
 *   <EmptyState
 *     illustration="frame"
 *     headline="Quiet for now."
 *     subhead="The first photo lands here."
 *     cta={{ label: "Take a photo", onClick: openCamera }}
 *   />
 */
export default function EmptyState({ illustration = "frame", headline, subhead, cta }) {
  return (
    <div className="empty-state">
      <Illustration name={illustration} />
      <h3 className="empty-state-title">{headline}</h3>
      {subhead && <p className="empty-state-sub">{subhead}</p>}
      {cta && (
        <button type="button" className="btn btn-primary empty-state-cta" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}

function Illustration({ name }) {
  const common = {
    width: 56,
    height: 56,
    viewBox: "0 0 56 56",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "empty-state-glyph",
    "aria-hidden": true,
  };

  if (name === "face") {
    // Soft face outline: oval + two eyes + a brow line. Geometric, not sketchy.
    return (
      <svg {...common}>
        <ellipse cx="28" cy="28" rx="14" ry="17" />
        <path d="M22 26h.01M34 26h.01" strokeWidth="2.2" />
        <path d="M21 35c2.5 2 4.5 3 7 3s4.5-1 7-3" />
      </svg>
    );
  }
  if (name === "camera") {
    // A trimmed camera silhouette. No flash, no grid — calm.
    return (
      <svg {...common}>
        <path d="M8 18a3 3 0 0 1 3-3h6l3-4h12l3 4h6a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3Z" />
        <circle cx="28" cy="28" r="7" />
      </svg>
    );
  }
  // frame — empty picture frame with mat lines
  return (
    <svg {...common}>
      <rect x="10" y="8" width="36" height="40" rx="2" />
      <rect x="16" y="14" width="24" height="28" rx="1" opacity="0.5" />
    </svg>
  );
}
