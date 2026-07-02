import React, { useEffect, useRef, useState } from "react";
import { getEventContent } from '@/state/eventContent.js';
import { AnimatePresence, motion } from "framer-motion";
import { useFocusTrap } from '@/hooks/useFocusTrap.js';

const INSTALL_STEPS = [
  {
    title: "Tap Share",
    detail: "The square-with-arrow icon at the bottom of Safari.",
    icon: "share",
  },
  {
    title: "Add to Home Screen",
    detail: "Scroll the menu and choose this option.",
    icon: "plus",
  },
  {
    title: "Tap Add",
    detail: "Done — the app opens from your home screen like a native icon.",
    icon: "check",
  },
];

const OPEN_SAFARI_STEPS = [
  {
    title: "Open the menu",
    detail: "Tap ⋯ (Chrome) or the share icon, then choose Open in Safari.",
    icon: "menu",
  },
  {
    title: "Tap Share in Safari",
    detail: "The square-with-arrow icon at the bottom of the screen.",
    icon: "share",
  },
  {
    title: "Add to Home Screen",
    detail: "Scroll the menu, tap Add to Home Screen, then tap Add.",
    icon: "plus",
  },
];

/**
 * iOS install walkthrough — Apple has no programmatic install API.
 *
 * @param {"install" | "open-safari"} [variant]
 */
export default function InstallGuideModal({ open, onClose, variant = "install" }) {
  const cardRef = useRef(null);
  const [copied, setCopied] = useState(false);
  useFocusTrap(cardRef, open);

  const needsSafari = variant === "open-safari";
  const steps = needsSafari ? OPEN_SAFARI_STEPS : INSTALL_STEPS;

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      /* fallback: select-less environments */
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="a2hs-guide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="a2hs-guide-title"
        >
          <motion.button
            type="button"
            className="a2hs-guide-backdrop"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          />
          <motion.div
            className="a2hs-guide-sheet"
            ref={cardRef}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="a2hs-guide-handle" aria-hidden />
            <img src="/icons/icon-180.png" alt="" className="a2hs-guide-icon" width={52} height={52} />
            <p className="a2hs-guide-kicker">{getEventContent().initials}</p>
            <h2 className="a2hs-guide-title" id="a2hs-guide-title">
              {needsSafari ? "Open in Safari first" : "Two quick steps in Safari"}
            </h2>
            <p className="a2hs-guide-lede">
              {needsSafari
                ? "iPhone needs Safari to add apps to your home screen — Chrome and other browsers can't do it in one tap."
                : "Apple doesn't allow one-tap install from the web. Tap Share, then Add to Home Screen — takes about 10 seconds."}
            </p>

            {needsSafari && (
              <button type="button" className="a2hs-guide-copy" onClick={copyLink}>
                <LinkIcon />
                <span>{copied ? "Link copied" : "Copy link for Safari"}</span>
              </button>
            )}

            <ol className="a2hs-guide-steps">
              {steps.map((step, i) => (
                <li key={step.title} className="a2hs-guide-step">
                  <span className="a2hs-guide-step-num" aria-hidden>{i + 1}</span>
                  <span className="a2hs-guide-step-icon" aria-hidden>
                    <StepIcon name={step.icon} />
                  </span>
                  <div className="a2hs-guide-step-body">
                    <p className="a2hs-guide-step-title">{step.title}</p>
                    <p className="a2hs-guide-step-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <button type="button" className="btn btn-primary a2hs-guide-done" onClick={onClose}>
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function StepIcon({ name }) {
  if (name === "menu") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round">
        <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "share") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4" />
        <path d="m8 8 4-4 4 4" />
        <path d="M5 20h14a2 2 0 0 0 2-2v-2" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
