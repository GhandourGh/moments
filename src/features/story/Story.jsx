import React from "react";
import { Navigate } from "react-router-dom";
import { useEventContent } from '@/state/eventContent.js';
import BackLink from '@/components/layout/BackLink.jsx';

/**
 * Editorial long-form story chapters — toggled per event from /host.
 */
export default function Story() {
  const { coupleNames, initials, hashtag, story, storyTitle, storyLede, features } = useEventContent();

  if (features.story === false) {
    return <Navigate to="." replace />;
  }

  const title = storyTitle?.trim() || "How we got here";
  const lede = storyLede?.trim()
    || (coupleNames
      ? `The short version of ${coupleNames}. The long version comes later tonight.`
      : "A few chapters from tonight.");

  if (!story.length) {
    return (
      <section className="page-section page-section-wide">
        <BackLink />
        <header className="section-head">
          <h1 className="section-title">{title}</h1>
          <p className="section-lede">{lede}</p>
        </header>
        <p className="section-lede">No story chapters yet — add them in Host tools.</p>
      </section>
    );
  }

  return (
    <section className="page-section page-section-wide">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">{title}</h1>
        <p className="section-lede">{lede}</p>
      </header>

      <div className="story">
        {story.map((chap, i) => (
          <article
            key={`${chap.title}-${i}`}
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
          {initials && features.navbarInitials !== false && (
            <p className="story-foot-mark">{initials}</p>
          )}
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
