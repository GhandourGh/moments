import React from "react";

/**
 * Glassy timestamp pill overlaid on a photo tile. Shows the local time of
 * capture (e.g. "9:42 PM"). Falsy or zero `takenAt` renders nothing so
 * stub/placeholder photos don't display a misleading time.
 */
export default function TimeBadge({ takenAt, className = "" }) {
  if (!takenAt) return null;
  const label = new Date(takenAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <span className={`time-badge ${className}`} aria-label={`Captured at ${label}`}>
      <ClockIcon />
      <span>{label}</span>
    </span>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
