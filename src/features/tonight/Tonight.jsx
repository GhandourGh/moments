import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useOutletContext } from "react-router-dom";
import { splitCoupleNames, useEventContent } from '@/state/eventContent.js';
import { usePhotos } from '@/state/PhotosContext.jsx';
import CapturedStrip from '@/features/tonight/CapturedStrip.jsx';
import NightTable from '@/features/tonight/NightTable.jsx';
import ScrollVelocityBand from '@/components/ui/ScrollVelocityBand.jsx';
import AddToHomeScreen from '@/features/welcome/AddToHomeScreen.jsx';

const HERO_STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.06 } },
};
const HERO_ITEM = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] },
  },
};

export default function Tonight() {
  const { shots } = usePhotos();
  const { openCamera } = useOutletContext();
  const content = useEventContent();
  const [first, second] = splitCoupleNames(content);
  const [showScrollCue, setShowScrollCue] = useState(true);
  // The home-page rails are stills-only. Videos live in their own section
  // in the gallery and shouldn't autoplay on the cover page.
  const photoShots = shots.filter((s) => s.mediaType !== "video");

  // Hide the scroll cue once the user scrolls past the first ~80px —
  // they've found the rest of the page, no nudge needed.
  useEffect(() => {
    function onScroll() {
      if (window.scrollY > 80) {
        setShowScrollCue(false);
        window.removeEventListener("scroll", onScroll);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <section className="hero" id="hero">
        <div className="hero-media" aria-hidden>
          <div
            className={`hero-bg${content.loaded && content.heroImageUrl ? " hero-bg--image" : ""}`}
            style={content.loaded && content.heroImageUrl
              ? { backgroundImage: `url("${content.heroImageUrl}")` }
              : undefined}
          />
          <div className="hero-vignette" />
        </div>

        <motion.div
          className="hero-content"
          initial="hidden"
          animate="visible"
          variants={HERO_STAGGER}
        >
          <motion.p className="hero-eyebrow" variants={HERO_ITEM}>{content.dateDisplay}</motion.p>
          <motion.h1 className="hero-title" variants={HERO_ITEM}>
            <span className="hero-name">{first}</span>
            {second && <span className="hero-amp">&amp;</span>}
            {second && <span className="hero-name">{second}</span>}
          </motion.h1>
          <motion.p className="hero-lede" variants={HERO_ITEM}>
            {content.heroLede}
          </motion.p>

          <motion.div className="hero-cta" variants={HERO_ITEM}>
            <div className="hero-cta-row">
              <button type="button" className="cta" onClick={openCamera}>
                <HeroCameraIcon />
                <span>Take a photo</span>
              </button>
              <Link className="cta cta-ghost" to="gallery">
                <span>See the gallery</span>
              </Link>
            </div>
            <span className="cta-hint">
              {shots.length === 0
                ? "Be the first to capture the night"
                : `${shots.length} ${shots.length === 1 ? "moment" : "moments"} shared so far`}
            </span>
          </motion.div>
        </motion.div>

        {showScrollCue && (
          <span className="hero-scroll-cue" aria-hidden>
            <span className="hero-scroll-cue-word">Scroll</span>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none"
                 stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 1v11M1 8l4 4 4-4" />
            </svg>
          </span>
        )}
      </section>

      <ScrollVelocityBand />

      {photoShots.length > 0 && <CapturedStrip shots={photoShots} />}
      <NightTable shots={photoShots} />

      <Schedule />
      <AddToHomeScreen />
    </>
  );
}

/**
 * Parse "5:30 PM" against COUPLE.dateISO into a Date. Returns null if
 * either piece is missing or malformed — caller treats null as "no live
 * indicator," which preserves the original static schedule rendering.
 */
function parseScheduleTime(time, dateISO) {
  if (!time || !dateISO) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

/**
 * Tags each schedule row as past | current | upcoming based on `now`.
 * "current" is the most recent row whose time has already passed, but
 * only while the next row is still in the future.
 */
function scheduleStatus(rows, now, dateISO) {
  const stamps = rows.map((r) => parseScheduleTime(r.time, dateISO));
  if (stamps.some((s) => s == null)) return rows.map(() => "upcoming");
  let currentIdx = -1;
  for (let i = 0; i < stamps.length; i++) {
    if (stamps[i] <= now) currentIdx = i;
  }
  return rows.map((_, i) => {
    if (i < currentIdx) return "past";
    if (i === currentIdx) return "current";
    return "upcoming";
  });
}

function Schedule() {
  const { schedule, dressCode, dateISO } = useEventContent();
  // 30s tick keeps "now" honest without burning render cycles.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const statuses = scheduleStatus(schedule, now, dateISO);
  if (!schedule.length) return null;

  return (
    <section className="tn-section section-band section-band--cream">
      <div className="section-inner">
        <header className="tn-head">
          <h2 className="tn-title display-title">Tonight's flow</h2>
          {dressCode && (
            <span className="dress-chip">
              <span className="dress-chip-dot" />
              {dressCode}
            </span>
          )}
        </header>

        <ol className="timeline" aria-label="Schedule">
          {schedule.map((row, i) => (
            <li className={`tl-row tl-row--${statuses[i]}`} key={row.title}>
              <div className="tl-time">{row.time}</div>
              <div className="tl-marker" aria-hidden>
                {statuses[i] === "current"
                  ? <span className="tl-dot tl-dot--live ntable-live-dot" />
                  : <span className="tl-dot" />}
              </div>
              <div className="tl-body">
                <p className="tl-name">
                  {row.title}
                  {statuses[i] === "current" && (
                    <span className="tl-now-pill" aria-label="happening now">Now</span>
                  )}
                </p>
                <p className="tl-detail">{row.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function HeroCameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}
