import React, { useEffect, useRef } from "react";
import { COUPLE } from "../couple.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import AddToHomeScreen from "./AddToHomeScreen.jsx";

export const WELCOME_KEY = "fg.welcomed.v1";

/**
 * Shown on first visit (gated by localStorage). Single card: what this app
 * is, how it works, a one-line consent, and a primary "I'm in" button.
 * Can also be reopened explicitly from /story.
 */
export default function WelcomeModal({ onClose }) {
  const cardRef = useRef(null);
  useFocusTrap(cardRef, true);

  // ESC also closes.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function dismiss() {
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* private mode */ }
    onClose();
  }

  return (
    <div className="wm" role="dialog" aria-modal="true" aria-labelledby="wm-title">
      <div className="wm-backdrop" onClick={dismiss} />
      <div className="wm-card" ref={cardRef}>
        <img src="/logo.svg" alt="" className="wm-mark" />
        <p className="wm-eyebrow">{COUPLE.initials} &nbsp;·&nbsp; {COUPLE.date}</p>
        <h2 className="wm-title" id="wm-title">Welcome to our gallery</h2>
        <p className="wm-body">
          Tap the camera anywhere in the app to capture a photo. Every shot you
          take lands in a shared gallery the whole night sees.
        </p>
        <ul className="wm-bullets">
          <li><BulletIcon name="lock" /> Photos stay between you and the couple.</li>
          <li><BulletIcon name="link" /> Lives in your browser — pin it for one-tap access.</li>
          <li><BulletIcon name="infinity" /> Take as many photos as you like.</li>
        </ul>
        <p className="wm-consent">
          By using the app you agree your photos may be shared with the
          couple and other guests in this event.
        </p>
        <div className="wm-actions">
          <AddToHomeScreen variant="compact" className="wm-a2hs" />
          <button className="btn btn-primary wm-cta" onClick={dismiss}>
            I'm in
          </button>
        </div>
      </div>
    </div>
  );
}

function BulletIcon({ name }) {
  const common = {
    width: 14, height: 14, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
    className: "wm-bullet-icon", "aria-hidden": true,
  };
  if (name === "lock") return (
    <svg {...common}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
  if (name === "link") return (
    <svg {...common}>
      <path d="M10 13a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
      <path d="M14 11a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </svg>
  );
  // infinity
  return (
    <svg {...common}>
      <path d="M8 8a4 4 0 1 1 0 8c-2-2-4-6-8-6-1 0 0 0 0 0" style={{ display: "none" }} />
      <path d="M17 8a4 4 0 1 1 0 8c-3 0-4-8-10-8a4 4 0 1 0 0 8c6 0 7-8 10-8Z" />
    </svg>
  );
}
