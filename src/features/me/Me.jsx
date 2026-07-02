import React, { useEffect, useMemo, useRef, useState } from "react";
import BackLink from '@/components/layout/BackLink.jsx';
import CameraView from '@/features/camera/CameraView.jsx';
import PhotoGrid from '@/features/gallery/PhotoGrid.jsx';
import Lightbox from '@/features/gallery/Lightbox.jsx';
import { usePhotos } from '@/state/PhotosContext.jsx';
import { env } from '@/config/env.js';
import { hasBackend, matchSelfie, patchSession } from '@/services/api/index.js';
import { ensureGalleryIndexed } from '@/services/faces/galleryIndex.js';
import { loadFaceModels } from '@/services/faces/index.js';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { getGuest, isValidName, subscribeGuest, updateGuest } from '@/state/guest.js';
import { isMyShot } from '@/state/guestAttribution.js';

/** @typedef {'idle' | 'models' | 'indexing' | 'matching' | 'done' | 'error'} ScanPhase */

const SCAN_LABELS = {
  models: "Loading face models…",
  indexing: "Scanning tonight's gallery…",
  matching: "Matching your face…",
};

/**
 * "Find photos I'm in." Face AI runs only after the guest picks a selfie
 * and taps Find my photos — nothing loads or scans on page open.
 */
export default function Me() {
  const { shots } = usePhotos();
  const [selfieOpen, setSelfieOpen] = useState(false);
  /** @type {[ { url: string, blob: Blob } | null, Function ]} */
  const [selfie, setSelfie] = useState(null);
  const [matchIds, setMatchIds] = useState(null);
  /** @type {[ScanPhase, Function]} */
  const [scanPhase, setScanPhase] = useState("idle");
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 });
  const [scanError, setScanError] = useState("");
  const [matchOpenIndex, setMatchOpenIndex] = useState(null);
  const [mineOpenIndex, setMineOpenIndex] = useState(null);
  const [guestRev, setGuestRev] = useState(0);
  const scanAbort = useRef(null);
  const galleryInputRef = useRef(null);

  const faceMatchOn = hasBackend() && env.ai.faceMatchEnabled;
  const scanning = scanPhase === "models" || scanPhase === "indexing" || scanPhase === "matching";

  useEffect(() => subscribeGuest(() => setGuestRev((n) => n + 1)), []);

  const galleryShots = useMemo(
    () => shots.filter((s) => !s.seed && (s.mediaType ?? "photo") !== "video"),
    [shots]
  );

  const mine = useMemo(() => shots.filter((s) => isMyShot(s)), [shots, guestRev]);

  const matches = scanPhase === "done" && matchIds
    ? shots.filter((s) => matchIds.includes(s.serverId ?? s.id))
    : [];

  function clearSelfie() {
    scanAbort.current?.abort();
    scanAbort.current = null;
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
    setSelfie(null);
    setMatchIds(null);
    setScanPhase("idle");
    setScanProgress({ scanned: 0, total: 0 });
    setScanError("");
  }

  function setSelfieFromBlob(blob) {
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
    setSelfie({ url: URL.createObjectURL(blob), blob });
    setMatchIds(null);
    setScanPhase("idle");
    setScanError("");
  }

  function onCameraCapture(blob) {
    setSelfieFromBlob(blob);
    setSelfieOpen(false);
  }

  function onGalleryPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setSelfieFromBlob(file);
  }

  async function startScan() {
    if (!selfie?.blob || scanning) return;
    if (!faceMatchOn) {
      setScanError("Face match isn't available for this event.");
      setScanPhase("error");
      return;
    }

    scanAbort.current?.abort();
    const ac = new AbortController();
    scanAbort.current = ac;

    setMatchIds(null);
    setScanError("");
    setScanProgress({ scanned: 0, total: 0 });

    try {
      setScanPhase("models");
      await loadFaceModels();
      if (ac.signal.aborted) return;

      setScanPhase("indexing");
      await ensureGalleryIndexed(galleryShots, {
        signal: ac.signal,
        onProgress: ({ scanned, total }) => setScanProgress({ scanned, total }),
      });
      if (ac.signal.aborted) return;

      setScanPhase("matching");
      const res = await matchSelfie(selfie.blob, { signal: ac.signal });
      if (ac.signal.aborted) return;

      if (!res.ok) {
        if (res.reason === "no-face-detected") {
          setScanError("We couldn't find a clear face in that photo. Try a front-facing selfie with good light.");
        } else {
          setScanError("Something went wrong. Try again in a moment.");
        }
        setScanPhase("error");
        return;
      }

      setMatchIds(res.matches || []);
      setScanPhase("done");
    } catch {
      if (!ac.signal.aborted) {
        setScanError("Scan interrupted. Check your connection and try again.");
        setScanPhase("error");
      }
    }
  }

  useEffect(() => () => {
    scanAbort.current?.abort();
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
  }, [selfie?.url]);

  const statusText = useMemo(() => {
    if (scanPhase === "error") return scanError;
    if (scanPhase === "models") return SCAN_LABELS.models;
    if (scanPhase === "indexing") {
      const { scanned, total } = scanProgress;
      if (total > 0) return `${SCAN_LABELS.indexing} ${scanned} of ${total}`;
      return `${SCAN_LABELS.indexing} Preparing photos…`;
    }
    if (scanPhase === "matching") return SCAN_LABELS.matching;
    if (scanPhase === "done") {
      return matches.length
        ? `Found ${matches.length} photo${matches.length === 1 ? "" : "s"} you may be in.`
        : "Scan complete — no matches yet. Try a clearer front-facing selfie, or scan again after more photos land.";
    }
    if (selfie) {
      return "Your selfie stays on this device. Tap Find my photos when you're ready — we'll scan tonight's gallery for your face.";
    }
    return "Optional and private: add a selfie, then start a scan. Nothing runs until you ask.";
  }, [scanPhase, scanProgress, scanError, selfie, matches.length]);

  const progressPct = scanPhase === "indexing" && scanProgress.total > 0
    ? Math.round((scanProgress.scanned / scanProgress.total) * 100)
    : scanPhase === "models"
      ? null
      : scanPhase === "matching"
        ? 100
        : null;

  return (
    <section className="page-section">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">Find every shot you're in</h1>
        <p className="section-lede">
          Add a selfie, then start a scan when you want. Face matching only
          runs on this screen — never in the background.
        </p>
      </header>

      <NameEditor />

      <div className="me-card">
        <div className="me-card-figure">
          {selfie ? (
            <img src={selfie.url} alt="Your selfie" />
          ) : (
            <div className="me-card-empty" aria-hidden>
              <SelfieIcon />
            </div>
          )}
        </div>
        <div className="me-card-body">
          <p className="me-card-eyebrow">
            {scanning ? "Scanning" : selfie ? "Your selfie" : "Optional"}
          </p>
          <p className="me-card-text" aria-live="polite">
            {statusText}
          </p>

          {(scanning || progressPct != null) && (
            <div className="me-scan" aria-hidden={!scanning}>
              <div className="me-scan-track">
                <div
                  className={`me-scan-fill${scanPhase === "models" ? " me-scan-fill--pulse" : ""}`}
                  style={scanPhase === "models"
                    ? undefined
                    : { "--me-scan-pct": (progressPct ?? 0) / 100 }}
                />
              </div>
              <ol className="me-scan-steps">
                <li className={scanPhase === "models" ? "is-active" : scanPhase !== "idle" ? "is-done" : ""}>
                  Load models
                </li>
                <li className={scanPhase === "indexing" ? "is-active" : ["matching", "done"].includes(scanPhase) ? "is-done" : ""}>
                  Scan gallery
                </li>
                <li className={scanPhase === "matching" ? "is-active" : scanPhase === "done" ? "is-done" : ""}>
                  Match face
                </li>
              </ol>
            </div>
          )}

          <div className="me-card-actions">
            {!selfie ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setSelfieOpen(true)}
                >
                  Take a selfie
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  Choose from gallery
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startScan}
                  disabled={scanning || !faceMatchOn}
                >
                  {scanning ? "Scanning…" : scanPhase === "done" ? "Scan again" : "Find my photos"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelfieOpen(true)}
                  disabled={scanning}
                >
                  Retake
                </button>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={scanning}
                >
                  Different photo
                </button>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={clearSelfie}
                  disabled={scanning}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="me-file-input"
            onChange={onGalleryPick}
            aria-label="Choose a selfie from your photo library"
          />

          {!faceMatchOn && (
            <p className="me-card-note">
              Face match is turned off for this event.
            </p>
          )}
        </div>
      </div>

      {scanPhase === "done" && selfie && (
        <section className="me-block">
          <h2 className="me-block-title">
            Photos with you <span className="me-block-count">{matches.length}</span>
          </h2>
          {matches.length === 0 ? (
            <EmptyState
              illustration="face"
              headline="No matches this time"
              subhead="Try a clearer, well-lit front-facing selfie, or scan again after more guests upload photos."
            />
          ) : (
            <PhotoGrid shots={matches} onOpen={setMatchOpenIndex} />
          )}
          {matchOpenIndex != null && matches.length > 0 && (
            <Lightbox
              shots={matches}
              index={Math.min(matchOpenIndex, matches.length - 1)}
              onClose={() => setMatchOpenIndex(null)}
              onIndexChange={setMatchOpenIndex}
            />
          )}
        </section>
      )}

      <section className="me-block">
        <h2 className="me-block-title">
          Your captures tonight <span className="me-block-count">{mine.length}</span>
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            illustration="camera"
            headline="Nothing of yours yet."
            subhead="Photos you take with the camera button show up here."
          />
        ) : (
          <PhotoGrid shots={mine} onOpen={setMineOpenIndex} />
        )}
        {mineOpenIndex != null && (
          <Lightbox
            shots={mine}
            index={Math.min(mineOpenIndex, mine.length - 1)}
            onClose={() => setMineOpenIndex(null)}
            onIndexChange={setMineOpenIndex}
          />
        )}
      </section>

      {selfieOpen && (
        <CameraView
          defaultFacing="user"
          closeOnCapture
          allowVideo={false}
          onCapture={onCameraCapture}
          onClose={() => setSelfieOpen(false)}
        />
      )}
    </section>
  );
}

function NameEditor() {
  const [guest, setGuestState] = useState(() => getGuest());
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => subscribeGuest((g) => {
    setGuestState(g);
    if (!dirty) {
      setFirstName(g?.firstName ?? "");
      setLastName(g?.lastName ?? "");
    }
  }), [dirty]);

  const firstOk = isValidName(firstName);
  const lastOk = isValidName(lastName);
  const changed = guest ? firstName !== guest.firstName || lastName !== guest.lastName : true;
  const canSave = firstOk && lastOk && changed;

  function onSave(e) {
    e.preventDefault();
    if (!canSave) return;
    updateGuest({ firstName, lastName });
    patchSession({ firstName, lastName }).catch(() => {});
    setDirty(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(0), 1800);
  }

  if (!guest) return null;

  return (
    <section className="me-block me-name-block">
      <h2 className="me-block-title">Your name</h2>
      <p className="me-block-lede">
        Editing your name updates future uploads. Photos you've already
        shared keep the name they were shared with.
      </p>
      <form className="me-name-form" onSubmit={onSave}>
        <label className="me-name-field">
          <span className="me-name-label">First name</span>
          <input
            type="text"
            className="me-name-input"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setDirty(true); }}
            autoComplete="given-name"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={40}
            aria-invalid={dirty && !firstOk}
          />
        </label>
        <label className="me-name-field">
          <span className="me-name-label">Last name</span>
          <input
            type="text"
            className="me-name-input"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setDirty(true); }}
            autoComplete="family-name"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={40}
            aria-invalid={dirty && !lastOk}
          />
        </label>
        <div className="me-name-actions">
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            Save
          </button>
          {savedAt > 0 && <span className="me-name-saved" aria-live="polite">Saved</span>}
        </div>
      </form>
    </section>
  );
}

function SelfieIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </svg>
  );
}
