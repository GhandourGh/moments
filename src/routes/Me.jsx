import React, { useEffect, useState } from "react";
import BackLink from "../components/BackLink.jsx";
import CameraView from "../components/CameraView.jsx";
import PhotoGrid from "../components/PhotoGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { usePhotos } from "../state/PhotosContext.jsx";

/**
 * "Find photos I'm in." The selfie matcher is mocked — it returns a
 * deterministic slice of the gallery so the UI feels alive without the
 * backend. Wiring this to a real /match endpoint is a one-function swap.
 */
export default function Me() {
  const { shots } = usePhotos();
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfie, setSelfie] = useState(null); // { url } from last capture
  const [matchOpenIndex, setMatchOpenIndex] = useState(null);
  const [mineOpenIndex, setMineOpenIndex] = useState(null);

  const mine = shots.filter((s) => !s.seed); // anything the guest captured
  // Mocked match: a deterministic 1-in-3 slice of the seed gallery, so it
  // looks like "we found you" without doing any face matching.
  const matches = selfie ? shots.filter((_, i) => i % 3 === 0).slice(0, 6) : [];

  function onCapture(blob) {
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
    setSelfie({ url: URL.createObjectURL(blob) });
    setSelfieOpen(false);
  }

  useEffect(() => () => {
    if (selfie?.url) URL.revokeObjectURL(selfie.url);
  }, [selfie?.url]);

  return (
    <section className="page-section">
      <BackLink />
      <header className="section-head">
        <p className="section-eyebrow">Photos of you</p>
        <h1 className="section-title">Find every shot you're in</h1>
        <p className="section-lede">
          Take one quick selfie and we'll surface the photos from tonight
          where your face appears.
        </p>
      </header>

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
            <div className="placeholder">
              <p>No matches yet. Try a clearer, well-lit selfie.</p>
            </div>
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
          <div className="placeholder">
            <p>Photos you take with the camera button show up here.</p>
          </div>
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
          showSessionStack={false}
          closeOnCapture
          onCapture={onCapture}
          onClose={() => setSelfieOpen(false)}
        />
      )}
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
