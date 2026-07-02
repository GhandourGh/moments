import React from "react";
import { Link } from "react-router-dom";

/**
 * Quiet "← Back" link, used at the top of every secondary screen. Defaults
 * to the event index — ".." resolves one route up from the child screen,
 * i.e. /e/<slug>. Accepts `to` and `label` overrides if a screen needs
 * something custom.
 */
export default function BackLink({ to = "..", label = "Back" }) {
  return (
    <Link to={to} className="back-link" aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
