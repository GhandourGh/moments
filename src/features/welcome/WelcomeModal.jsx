import React, { useEffect, useRef, useState } from "react";
import { useEventContent } from '@/state/eventContent.js';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import AddToHomeScreen from '@/features/welcome/AddToHomeScreen.jsx';
import { getGuest, isValidName, setGuest } from '@/state/guest.js';
import { createSession } from '@/services/api/index.js';

export const WELCOME_KEY = "fg.welcomed.v1";

/**
 * Shown on first visit — gated by localStorage AND by whether we've captured
 * a guest identity yet. Collects first + last name (both required, 1–40
 * chars) before the CTA is enabled. Names are visible on the photos the
 * guest shares.
 * Can also be reopened explicitly from /story.
 */
export default function WelcomeModal({ onClose }) {
  const cardRef = useRef(null);
  useFocusTrap(cardRef, true);
  const { initials, dateDisplay, coupleNames, features } = useEventContent();
  const eyebrow = [
    features.navbarInitials !== false && initials ? initials : "",
    dateDisplay || "",
  ].filter(Boolean).join(" · ");

  const existing = getGuest();
  const [firstName, setFirstName] = useState(existing?.firstName ?? "");
  const [lastName, setLastName] = useState(existing?.lastName ?? "");
  const [touched, setTouched] = useState(false);

  const firstOk = isValidName(firstName);
  const lastOk = isValidName(lastName);
  const canSubmit = firstOk && lastOk;

  // ESC closes only if the guest has already saved a name — otherwise the
  // name gate would be trivially bypassable.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (getGuest()) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setGuest({ firstName, lastName });
    // Register with the backend (sets the moment.sid cookie). Fire-and-forget:
    // if it fails, the upload queue retries before its next upload (docs/auth.md).
    createSession().catch(() => {});
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* private mode */ }
    onClose();
  }

  // Backdrop click only dismisses if the guest is already known — same
  // reasoning as the ESC handler.
  function onBackdropClick() {
    if (getGuest()) onClose();
  }

  return (
    <div className="wm" role="dialog" aria-modal="true" aria-labelledby="wm-title">
      <div className="wm-backdrop" onClick={onBackdropClick} />
      <form className="wm-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
        <img src="/logo.svg" alt="" className="wm-mark" />
        {eyebrow && <p className="wm-eyebrow">{eyebrow}</p>}
        <h2 className="wm-title" id="wm-title">
          {coupleNames ? `Welcome to ${coupleNames}` : "Welcome to the gallery"}
        </h2>
        <p className="wm-body">
          Tap the camera anywhere in the app to capture a photo. Every shot you
          take lands in a shared gallery the whole night sees.
        </p>

        <div className="wm-name-fields">
          <label className="wm-field">
            <span className="wm-field-label">First name</span>
            <input
              type="text"
              className="wm-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="given-name"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={40}
              required
              aria-invalid={touched && !firstOk}
            />
          </label>
          <label className="wm-field">
            <span className="wm-field-label">Last name</span>
            <input
              type="text"
              className="wm-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="family-name"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={40}
              required
              aria-invalid={touched && !lastOk}
            />
          </label>
        </div>
        <p className="wm-name-note">
          Your name will appear on the photos and videos you share tonight.
          You can update it later from your profile.
        </p>

        <p className="wm-consent">
          Take as many as you like — shots you share are visible to the couple
          and the other guests at this event.
        </p>
        <div className="wm-actions">
          <AddToHomeScreen variant="compact" className="wm-a2hs" />
          <button
            type="submit"
            className="btn btn-primary wm-cta"
            disabled={!canSubmit}
          >
            I'm in
          </button>
        </div>
      </form>
    </div>
  );
}

