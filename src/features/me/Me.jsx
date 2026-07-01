import React, { useEffect, useState } from "react";
import BackLink from '@/components/layout/BackLink.jsx';
import CameraView from '@/features/camera/CameraView.jsx';
import PhotoGrid from '@/features/gallery/PhotoGrid.jsx';
import Lightbox from '@/features/gallery/Lightbox.jsx';
import { usePhotos } from '@/state/PhotosContext.jsx';
import { hasBackend, matchSelfie } from '@/services/api/index.js';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { getGuest, isValidName, subscribeGuest, updateGuest } from '@/state/guest.js';

/**
 * "Find photos I'm in." The selfie matcher is mocked — it returns a
 * deterministic slice of the gallery so the UI feels alive without the
 * backend. Wiring this to a real /match endpoint is a one-function swap.
 */
export default function Me() {
  const { shots } = usePhotos();
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfie, setSelfie] = useState(null); // { url } from last capture
  const [matchIds, setMatchIds] = useState(null); // null = mock fallback
  const [matchOpenIndex, setMatchOpenIndex] = useState(null);
  const [mineOpenIndex, setMineOpenIndex] = useState(null);

  const mine = shots.filter((s) => !s.seed); // anything the guest captured
  // Real match if the backend gave us ids; otherwise a deterministic 1-in-3
  // slice of the seed gallery so the UI still feels alive in dev / offline.
  const matches = selfie
    ? matchIds
      ? shots.filter((s) => matchIds.includes(s.serverId ?? s.id))
      : shots.filter((_, i) => i % 3 === 0).slice(0, 6)
    : [];

  async function onCapture(blob) {
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
    setSelfie({ url: URL.createObjectURL(blob) });
    setSelfieOpen(false);
    setMatchIds(null);
    if (hasBackend()) {
      try {
        const res = await matchSelfie(blob);
        if (res.ok) setMatchIds(res.matches || []);
      } catch { /* keep the mock fallback */ }
    }
  }

  useEffect(() => () => {
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
  }, [selfie?.url]);

  return (
    <section className="page-section">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">Find every shot you're in</h1>
        <p className="section-lede">
          Take one quick selfie and we'll surface the photos from tonight
          where your face appears.
        </p>
      </header>

      <NameEditor />

      {/* Selfie card */}
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
          <p className="me-card-eyebrow">{selfie ? "We've got you" : "Step one"}</p>
          <p className="me-card-text">
            {selfie
              ? `${matches.length} photo${matches.length === 1 ? "" : "s"} we think you're in.`
              : "A clear, front-facing selfie works best. Nothing is saved beyond this session."}
          </p>
          <div className="me-card-actions">
            <button className="btn btn-primary" onClick={() => setSelfieOpen(true)}>
              {selfie ? "Retake selfie" : "Take a selfie"}
            </button>
            {selfie && (
              <button
                className="btn btn-text"
                onClick={() => {
                  URL.revokeObjectURL(selfie.url);
                  setSelfie(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mocked match results */}
      {selfie && (
        <section className="me-block">
          <h2 className="me-block-title">
            Photos with you <span className="me-block-count">{matches.length}</span>
          </h2>
          {matches.length === 0 ? (
            <EmptyState
              illustration="face"
              headline="We'll start finding you here."
              subhead="No matches yet — try a clearer, well-lit selfie."
            />
          ) : (
            <PhotoGrid shots={matches} onOpen={setMatchOpenIndex} />
          )}
          {matchOpenIndex != null && (
            <Lightbox
              shots={matches}
              index={Math.min(matchOpenIndex, matches.length - 1)}
              onClose={() => setMatchOpenIndex(null)}
              onIndexChange={setMatchOpenIndex}
            />
          )}
        </section>
      )}

      {/* The guest's own captures */}
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
          onCapture={onCapture}
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

  // Keep the form in sync when the guest changes elsewhere (e.g. another tab).
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
    setDirty(false);
    setSavedAt(Date.now());
    // Clear the "Saved" chip after a beat.
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
