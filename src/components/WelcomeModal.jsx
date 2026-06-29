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
          <li><Dot /> Photos stay between you and the couple.</li>
          <li><Dot /> No app, no account — just this link.</li>
          <li><Dot /> You can take as many photos as you like.</li>
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

function Dot() {
  return <span className="wm-dot" aria-hidden />;
}
