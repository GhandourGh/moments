import React from "react";
import { Link, useOutletContext } from "react-router-dom";
import { COUPLE, COUPLE_NAMES, SCHEDULE, DRESS_CODE } from "../couple.js";
import { usePhotos } from "../state/PhotosContext.jsx";
import CapturedStrip from "../components/CapturedStrip.jsx";
import NightTable from "../components/NightTable.jsx";
import ScrollVelocityBand from "../components/ScrollVelocityBand.jsx";
import AddToHomeScreen from "../components/AddToHomeScreen.jsx";

export default function Tonight() {
  const { shots } = usePhotos();
  const { openCamera } = useOutletContext();
  const [first, second] = COUPLE_NAMES;

  return (
    <>
      <section className="hero" id="hero">
        <div className="hero-media" aria-hidden>
          <div className="hero-bg" />
          <div className="hero-vignette" />
        </div>

        <div className="hero-content">
          <p className="hero-eyebrow">{COUPLE.date}</p>
          <h1 className="hero-title">
            <span className="hero-name">{first}</span>
            <span className="hero-amp">&amp;</span>
            <span className="hero-name">{second}</span>
          </h1>
          <p className="hero-lede">
            Help us remember every moment. Tap the camera below to capture a
            photo — it joins the shared gallery the instant you snap it.
          </p>

          <div className="hero-cta">
            <div className="hero-cta-row">
              <button type="button" className="cta" onClick={openCamera}>
                <HeroCameraIcon />
                <span>Take a photo</span>
              </button>
              <Link className="cta cta-ghost" to="/gallery">
                <span>See the gallery</span>
              </Link>
            </div>
            <span className="cta-hint">
              {shots.length === 0
                ? "Be the first to capture the night"
                : `${shots.length} ${shots.length === 1 ? "moment" : "moments"} shared so far`}
            </span>
          </div>
        </div>
      </section>

      <ScrollVelocityBand />

      {shots.length > 0 && <CapturedStrip shots={shots} />}
      <NightTable shots={shots} />

      <Schedule />
      <AddToHomeScreen />
    </>
  );
}

function Schedule() {
  return (
    <section className="tn-section section-band section-band--cream">
      <div className="section-inner">
        <header className="tn-head">
          <h2 className="tn-title display-title">Tonight's flow</h2>
          <span className="dress-chip">
            <span className="dress-chip-dot" />
            {DRESS_CODE}
          </span>
        </header>

        <ol className="timeline" aria-label="Schedule">
          {SCHEDULE.map((row) => (
            <li className="tl-row" key={row.title}>
              <div className="tl-time">{row.time}</div>
              <div className="tl-marker" aria-hidden>
                <span className="tl-dot" />
              </div>
              <div className="tl-body">
                <p className="tl-name">{row.title}</p>
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
