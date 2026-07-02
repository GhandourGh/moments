import React from "react";
import { NavLink } from "react-router-dom";

/**
 * Mobile-only bottom tab bar. Four navigation tabs + a center "capture"
 * button that triggers the in-app camera regardless of current route.
 */
export default function BottomTabBar({ onCapture }) {
  // Relative targets resolve under the current /e/<slug> (the tab bar
  // renders inside the pathless Layout route).
  return (
    <nav className="tabbar" aria-label="Primary">
      <TabLink to="." label="Tonight" icon={<SparkIcon />} end />
      <TabLink to="gallery" label="Gallery" icon={<GridIcon />} />

      <button
        type="button"
        className="tabbar-capture"
        onClick={onCapture}
        aria-label="Take a photo"
      >
        <CameraIcon />
      </button>

      <TabLink to="me" label="Me" icon={<PersonIcon />} />
      <TabLink to="story" label="Story" icon={<BookIcon />} />
    </nav>
  );
}

function TabLink({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `tab ${isActive ? "tab-active" : ""}`}
    >
      <span className="tab-icon" aria-hidden>{icon}</span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );
}

/* ----------------------------- Icons ----------------------------- */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}
