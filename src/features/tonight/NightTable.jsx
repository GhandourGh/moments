import React, { useEffect, useMemo, useRef, useState } from "react";
import Lightbox from '@/features/gallery/Lightbox.jsx';
import MemoryCard from '@/features/tonight/MemoryCard.jsx';

const WHISPERS = [
  "Little moments, piling up.",
  "The night keeps getting fuller.",
  "Every frame adds another layer.",
  "Something beautiful is accumulating.",
];

function minutesAgo(takenAt) {
  if (!takenAt) return null;
  return Math.max(0, Math.floor((Date.now() - takenAt) / 60_000));
}

function whisperFor(guestCount, freshMins) {
  if (guestCount === 0) return "The gallery is just getting started.";
  if (freshMins != null && freshMins < 3) return "Something new just arrived.";
  return WHISPERS[guestCount % WHISPERS.length];
}

/**
 * Keepsake memory row — branded cards under Just captured on Tonight.
 */
export default function NightTable({ shots }) {
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(() => shots.length > 0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const guestShots = useMemo(() => shots.filter((s) => !s.seed), [shots]);
  const displayShots = useMemo(
    () => (guestShots.length ? guestShots : shots).slice(0, 3),
    [guestShots, shots],
  );
  const guestCount = guestShots.length;
  const freshest = guestShots[0];
  const freshMins = freshest ? minutesAgo(freshest.takenAt) : null;
  const whisper = whisperFor(guestCount, freshMins);

  useEffect(() => {
    if (shots.length > 0) setVisible(true);
  }, [shots.length]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15, rootMargin: "-40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      className={`ntable section-band section-band--alt ${visible ? "ntable-visible" : ""}`}
      ref={sectionRef}
      aria-label="Recent moments"
    >
      <div className="ntable-inner">
        <header className="ntable-head">
          <p className="ntable-kicker">
            <span className="ntable-live-dot" aria-hidden />
            Right now
          </p>
          <p className="ntable-whisper">{whisper}</p>
        </header>

        <div className="ntable-grid">
          {displayShots.map((shot, i) => (
            <MemoryCard
              key={shot.id}
              shot={shot}
              as="button"
              className={`ntable-slot ntable-slot-${i}`}
              style={{ "--i": i }}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>
      </div>

      {lightboxIndex != null && (
        <Lightbox
          shots={displayShots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </section>
  );
}
