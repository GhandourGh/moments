import React from "react";
import { COUPLE, STORY } from "../couple.js";
import BackLink from "../components/BackLink.jsx";

/**
 * Editorial long-form: alternating image + paragraph blocks with an italic
 * pull-quote per chapter. Images and alt text come from couple.js so the
 * couple can swap visuals per event without touching this file.
 */
export default function Story() {
  return (
    <section className="page-section page-section-wide">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">How we got here</h1>
        <p className="section-lede">
          The short version of {COUPLE.names}. The long version comes later
          tonight, with wine in hand.
        </p>
      </header>

      <div className="story">
        {STORY.map((chap, i) => (
          <article
            key={chap.title}
            className={`chap ${i % 2 ? "chap-rev" : ""}`}
          >
            <figure className="chap-media">
              <img src={chap.image} alt={chap.alt ?? ""} loading="lazy" />
            </figure>
            <div className="chap-text">
              <p className="chap-num">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="chap-title">{chap.title}</h2>
              <p className="chap-body">{chap.body}</p>
              <p className="chap-pull">&ldquo;{chap.pull}&rdquo;</p>
            </div>
          </article>
        ))}

        <footer className="story-foot">
          <p className="story-foot-mark">{COUPLE.initials}</p>
          <p className="story-foot-line">{COUPLE.hashtag}</p>
          <button
            type="button"
            className="story-foot-link"
            onClick={() => window.dispatchEvent(new CustomEvent("fg:show-welcome"))}
          >
            Show the welcome again
          </button>
        </footer>
      </div>
    </section>
  );
}
