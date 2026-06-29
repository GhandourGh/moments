import React, { useState } from "react";
import { motion } from "framer-motion";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import InstallGuideModal from "./InstallGuideModal.jsx";

/**
 * Add to Home Screen — one-tap on Android (when prompt available),
 * guided sheet on iPhone Safari, Safari redirect hint on iPhone Chrome.
 *
 * @param {"card" | "inline" | "compact"} [variant]
 */
export default function AddToHomeScreen({ variant = "card", className = "" }) {
  const {
    canShow,
    platform,
    iosNeedsSafari,
    iosSafari,
    isAndroidInstallable,
    installAndroid,
  } = useInstallPrompt();

  const [guideOpen, setGuideOpen] = useState(false);
  const [guideVariant, setGuideVariant] = useState("install");
  const [busy, setBusy] = useState(false);

  if (!canShow) return null;

  async function handleInstall() {
    if (iosNeedsSafari) {
      setGuideVariant("open-safari");
      setGuideOpen(true);
      return;
    }

    if (platform === "ios" || iosSafari) {
      setGuideVariant("install");
      setGuideOpen(true);
      return;
    }

    if (isAndroidInstallable) {
      setBusy(true);
      try {
        await installAndroid();
      } finally {
        setBusy(false);
      }
      return;
    }

    setGuideVariant("install");
    setGuideOpen(true);
  }

  const isCard = variant === "card";
  const isCompact = variant === "compact";

  const subtitle = iosNeedsSafari
    ? "Open this page in Safari first — then you can add it in two taps."
    : platform === "ios"
      ? "Tap below, then follow two quick steps in Safari."
      : "Install for quick access — camera ready from your home screen.";

  const buttonLabel = busy
    ? "Adding…"
    : iosNeedsSafari
      ? "Open in Safari to install"
      : "Add to Home Screen";

  const bandClass = isCard ? "section-band section-band--alt" : "";

  return (
    <>
      <motion.section
        className={`a2hs a2hs--${variant} ${bandClass} ${className}`.trim()}
        initial={isCard ? { opacity: 0, y: 12 } : false}
        whileInView={isCard ? { opacity: 1, y: 0 } : undefined}
        viewport={isCard ? { once: true, margin: "-40px" } : undefined}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        aria-label="Add to Home Screen"
      >
        {!isCompact && (
          <div className="a2hs-copy">
            {isCard && (
              <img
                src="/icons/icon-180.png"
                alt=""
                className="a2hs-app-icon"
                width={44}
                height={44}
              />
            )}
            <div className="a2hs-text">
              <h2 className="a2hs-title">
                {iosNeedsSafari ? "Install via Safari" : "Add to Home Screen"}
              </h2>
              <p className="a2hs-sub">{subtitle}</p>
              {iosNeedsSafari && (
                <p className="a2hs-hint">Chrome on iPhone can't install apps directly.</p>
              )}
            </div>
          </div>
        )}

        <div className={`a2hs-actions ${isCompact ? "a2hs-actions-compact" : ""}`}>
          <button
            type="button"
            className={`a2hs-btn ${isCompact ? "a2hs-btn-compact" : ""}`}
            onClick={handleInstall}
            disabled={busy}
          >
            <HomeIcon />
            <span>{buttonLabel}</span>
          </button>
        </div>
      </motion.section>

      <InstallGuideModal
        open={guideOpen}
        variant={guideVariant}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12H3l9-9 9 9h-2" />
      <path d="M5 12v7a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
