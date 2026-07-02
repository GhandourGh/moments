import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  useReducedMotion,
  animate,
} from "framer-motion";
import TimeBadge from '@/components/ui/TimeBadge.jsx';
import Lightbox from '@/features/gallery/Lightbox.jsx';

const SCROLL_PX_PER_SEC = 32;
const RESUME_AFTER_MS = 4500;
const TAP_MOVE_PX = 10;
const NAV_DURATION = 0.55;
const NAV_EASE = [0.23, 1, 0.32, 1];

function wrapOffset(x, half) {
  if (half <= 0) return x;
  while (x < -half) x += half;
  while (x > 0) x -= half;
  return x;
}

function clampOffset(x, trackWidth, railWidth) {
  const minX = Math.min(0, railWidth - trackWidth);
  return Math.max(minX, Math.min(0, x));
}

function nearestIndex(trackX, rail, cards, total) {
  if (!rail || !cards.length) return 0;
  const scrollLeft = -trackX;
  const railCenter = scrollLeft + rail.clientWidth / 2;
  let closest = 0;
  let minDist = Infinity;
  cards.slice(0, total).forEach((card, i) => {
    const center = card.offsetLeft + card.offsetWidth / 2;
    const dist = Math.abs(center - railCenter);
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  });
  return closest;
}

/**
 * Home-page "Just captured" rail. GPU-transform drift when idle (ScrollVelocity
 * pattern); drag + snap when touched. Tap a card → lightbox.
 */
export default function CapturedStrip({ shots }) {
  const railRef = useRef(null);
  const trackRef = useRef(null);
  const cardRefs = useRef([]);
  const trackX = useMotionValue(0);
  const halfWidthRef = useRef(0);
  const dragOriginRef = useRef(0);
  const navAnimRef = useRef(null);
  const syncRafRef = useRef(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const resumeTimerRef = useRef(null);
  const tapRef = useRef(null);

  const reduceMotion = useReducedMotion();
  const total = shots.length;
  const loop = total >= 2;
  const displayShots = loop ? [...shots, ...shots] : shots;

  const pause = useCallback(() => {
    setPaused(true);
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }, []);

  const measureTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    halfWidthRef.current = loop ? track.scrollWidth / 2 : 0;
  }, [loop]);

  useLayoutEffect(() => {
    measureTrack();
    window.addEventListener("resize", measureTrack);
    return () => window.removeEventListener("resize", measureTrack);
  }, [measureTrack, displayShots.length, total]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, displayShots.length);
    setActiveIndex(0);
    trackX.set(0);
  }, [shots[0]?.id, displayShots.length, trackX]);

  const syncActiveIndex = useCallback(() => {
    const rail = railRef.current;
    const cards = cardRefs.current.filter(Boolean);
    if (!rail || !total || !cards.length) return;
    setActiveIndex(nearestIndex(trackX.get(), rail, cards, total));
  }, [total, trackX]);

  useEffect(() => {
    const unsub = trackX.on("change", () => {
      if (syncRafRef.current) return;
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null;
        syncActiveIndex();
      });
    });
    return () => {
      unsub();
      if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current);
    };
  }, [trackX, syncActiveIndex]);

  useAnimationFrame((_, delta) => {
    if (paused || !loop || reduceMotion) return;
    const half = halfWidthRef.current;
    if (half <= 0) return;
    const next = wrapOffset(
      trackX.get() - (SCROLL_PX_PER_SEC * delta) / 1000,
      half,
    );
    trackX.set(next);
  });

  const scrollToIndex = useCallback((index, animateNav = true) => {
    const card = cardRefs.current[index];
    const rail = railRef.current;
    const track = trackRef.current;
    if (!card || !rail || !track) return;

    const target = -(card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2);
    const half = halfWidthRef.current;
    const resolved = loop
      ? wrapOffset(target, half)
      : clampOffset(target, track.scrollWidth, rail.clientWidth);

    pause();
    navAnimRef.current?.stop?.();

    if (animateNav && !reduceMotion) {
      navAnimRef.current = animate(trackX, resolved, {
        duration: NAV_DURATION,
        ease: NAV_EASE,
      });
    } else {
      trackX.set(resolved);
    }
    setActiveIndex(index % total);
  }, [pause, reduceMotion, total, trackX, loop]);

  const snapToNearest = useCallback(() => {
    const rail = railRef.current;
    const cards = cardRefs.current.filter(Boolean);
    if (!rail || !cards.length) return;
    const idx = nearestIndex(trackX.get(), rail, cards, total);
    scrollToIndex(idx);
  }, [scrollToIndex, total, trackX]);

  const bindDrag = useDrag(
    ({ down, movement: [mx], first, last }) => {
      pause();
      navAnimRef.current?.stop?.();

      if (first) dragOriginRef.current = trackX.get();

      const rail = railRef.current;
      const track = trackRef.current;
      const half = halfWidthRef.current;
      let next = dragOriginRef.current + mx;

      if (loop && half > 0) {
        next = wrapOffset(next, half);
      } else if (track && rail) {
        next = clampOffset(next, track.scrollWidth, rail.clientWidth);
      }

      trackX.set(next);

      if (last && !reduceMotion) {
        snapToNearest();
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    },
  );

  function step(delta) {
    const next = (activeIndex + delta + total) % total;
    scrollToIndex(next);
  }

  function onCardClick(index, e) {
    if (!tapRef.current) return;
    const dx = e.clientX - tapRef.current.x;
    const dy = e.clientY - tapRef.current.y;
    const dt = Date.now() - tapRef.current.t;
    tapRef.current = null;
    if (Math.hypot(dx, dy) > TAP_MOVE_PX || dt > 400) return;
    setLightboxIndex(index % total);
  }

  function onCardPointerDown(e) {
    pause();
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  if (!total) return null;

  return (
    <motion.section
      className="strip section-band section-band--cream"
      id="gallery"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="strip-head section-inner">
        <div className="strip-head-main">
          <h2 className="strip-title display-title">Just captured</h2>
          <span className="strip-sub">Live from tonight</span>
        </div>
        {total > 1 && (
          <div className="strip-nav" aria-label="Browse captures">
            <span className="strip-counter">{activeIndex + 1} / {total}</span>
            <button
              type="button"
              className="strip-nav-btn"
              onClick={() => step(-1)}
              aria-label="Previous photo"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              className="strip-nav-btn"
              onClick={() => step(1)}
              aria-label="Next photo"
            >
              <Chevron dir="right" />
            </button>
          </div>
        )}
      </div>

      <div className="strip-rail" ref={railRef}>
        <motion.div
          className="strip-track"
          ref={trackRef}
          style={{ x: trackX }}
          {...bindDrag()}
        >
          {displayShots.map((s, i) => (
            <button
              key={`${i < total ? "a" : "b"}-${s.id}`}
              type="button"
              ref={(el) => { cardRefs.current[i] = el; }}
              className={`strip-card ${i % total === activeIndex ? "strip-card-active" : ""}`}
              onPointerDown={onCardPointerDown}
              onClick={(e) => onCardClick(i, e)}
              aria-hidden={i >= total ? true : undefined}
              aria-label={i >= total ? undefined : `View photo ${(i % total) + 1} of ${total}`}
              tabIndex={i >= total ? -1 : 0}
            >
              {s.url ? (
                <img src={s.url} alt="" loading="lazy" draggable={false} />
              ) : (
                <span className="ph-tile-loading" aria-hidden />
              )}
              <TimeBadge takenAt={s.takenAt} />
            </button>
          ))}
        </motion.div>
      </div>

      {lightboxIndex != null && (
        <Lightbox
          shots={shots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </motion.section>
  );
}

function Chevron({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
