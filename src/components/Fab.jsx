import React from "react";

/**
 * Tablet+ floating action button — always-visible camera launcher for screens
 * wider than the bottom tab bar's breakpoint.
 */
export default function Fab({ onClick }) {
  return (
    <button className="fab" onClick={onClick} aria-label="Take a photo" type="button">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <circle cx="12" cy="13" r="3.6" />
      </svg>
    </button>
  );
}
