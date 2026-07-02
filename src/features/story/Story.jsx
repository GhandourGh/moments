import React from "react";
import { Navigate } from "react-router-dom";
import { useEventContent } from '@/state/eventContent.js';
import BackLink from '@/components/layout/BackLink.jsx';

/** Playful copy when chapters are off or not written yet. */
function mysteryContent(coupleNames) {
  const who = coupleNames?.trim() || "tonight";
  return {
    redactions: [
      "Chapter 01 — How it started",
      "Chapter 02 — The part we can't post",
      "Chapter 03 — You'll hear this one live",
    ],
    lines: [
      `The full timeline of ${who} is sealed until the right moment.`,
      "There are photos. There will be more photos. That's the whole plan.",
      "If you're impatient, find someone who claims they \"know nothing.\"",
    ],
    punchline: "Some stories are better told after the second toast.",
  };
}

function StoryFooter({ initials, hashtag, showInitials }) {
  return (
    <footer className="story-foot">
      {initials && showInitials && (
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
  );
}

function StoryMystery({ coupleNames }) {
  const mystery = mysteryContent(coupleNames);
  return (
    <div className="story-mystery">
      <p className="story-mystery-kicker">Confidential</p>
      <div className="story-mystery-seal" aria-hidden>
        <span>?</span>
      </div>
      <p className="story-mystery-punchline">{mystery.punchline}</p>
      <div className="story-mystery-body">
        {mystery.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <ul className="story-mystery-redactions" aria-label="Redacted chapters">
        {mystery.redactions.map((row) => (
          <li key={row}>
            <span className="story-mystery-redact-label">{row.split(" — ")[0]}</span>
            <span className="story-mystery-redact-bar" aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Editorial story chapters, or a mystery teaser when chapters are off / empty.
 */
export default function Story() {
  const {
    coupleNames,
    initials,
    hashtag,
    story,
    storyTitle,
    storyLede,
    features,
  } = useEventContent();

  if (features.storyNav === false) {
    return <Navigate to="." replace />;
  }

  const showChapters = features.story !== false && story.length > 0;
  const title = storyTitle?.trim()
    || (showChapters ? "How we got here" : "Still a mystery");
  const lede = storyLede?.trim()
    || (showChapters
      ? (coupleNames
        ? `The short version of ${coupleNames}. The long version comes later tonight.`
        : "A few chapters from tonight.")
      : (coupleNames
        ? `${coupleNames} asked us to keep the plot on a need-to-know basis.`
        : "The hosts locked this page. Ask nicely at the bar."));

  return (
    <section className="page-section page-section-wide">
      <BackLink />
      <header className="section-head">
        <h1 className="section-title">{title}</h1>
        <p className="section-lede">{lede}</p>
      </header>

      {showChapters ? (
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
          <StoryFooter
            initials={initials}
            hashtag={hashtag}
            showInitials={features.navbarInitials !== false}
          />
        </div>
      ) : (
        <>
          <StoryMystery coupleNames={coupleNames} />
          <StoryFooter
            initials={initials}
            hashtag={hashtag}
            showInitials={features.navbarInitials !== false}
          />
        </>
      )}
    </section>
  );
}
