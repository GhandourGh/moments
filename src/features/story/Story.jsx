import React from "react";
import { useEventContent } from '@/state/eventContent.js';
import BackLink from '@/components/layout/BackLink.jsx';

/**
 * Editorial long-form: alternating image + paragraph blocks with an italic
 * pull-quote per chapter. Images and alt text come from couple.js so the
 * couple can swap visuals per event without touching this file.
 */
export default function Story() {
  const { coupleNames, initials, hashtag, story } = useEventContent();
  return (
    <section className="page-section page-section-wide">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">How we got here</h1>
        <p className="section-lede">
          The short version of {coupleNames}. The long version comes later
          tonight, with wine in hand.
        </p>
      </header>

      <div className="story">
        {story.map((chap, i) => (
          <article
            key={chap.title}
            className={`chap ${i % 2 ? "chap-rev" : ""}`}
          >
            {chap.image && (
              <figure className="chap-media">
                <img src={chap.image} alt={chap.alt ?? ""} loading="lazy" />
              </figure>
            )}
            <div className="chap-text">
              <p className="chap-num">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="chap-title">{chap.title}</h2>
              <p className="chap-body">{chap.body}</p>
              {chap.pull && <p className="chap-pull">&ldquo;{chap.pull}&rdquo;</p>}
            </div>
          </article>
        ))}

        <footer className="story-foot">
          <p className="story-foot-mark">{initials}</p>
          {hashtag && <p className="story-foot-line">{hashtag}</p>}
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
