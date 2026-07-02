import React from "react";
import HeroCoverField from '@/components/HeroCoverField.jsx';
import { DEFAULT_FEATURES, FEATURE_FIELDS } from '@/config/eventDefaults.js';

/**
 * Per-event content form — fields + feature toggles stored in events.content.
 */

export const EMPTY_CONTENT = {
  coupleNames: "",
  initials: "",
  dateDisplay: "",
  hashtag: "",
  heroLede: "",
  heroImageUrl: "",
  heroStorageKey: "",
  dressCode: "",
  pageTitle: "",
  storyTitle: "",
  storyLede: "",
  schedule: [],
  story: [],
  features: { ...DEFAULT_FEATURES },
};

/** Strip empty fields before saving — only persist real overrides. */
export function cleanContent(c) {
  const out = {};
  for (const key of [
    "coupleNames", "initials", "dateDisplay", "hashtag", "heroLede",
    "heroStorageKey", "dressCode", "pageTitle", "storyTitle", "storyLede",
  ]) {
    const v = (c[key] ?? "").trim();
    if (v) out[key] = v;
  }
  const schedule = (c.schedule ?? [])
    .map((r) => ({
      time: r.time?.trim() ?? "",
      title: r.title?.trim() ?? "",
      detail: r.detail?.trim() ?? "",
    }))
    .filter((r) => r.time && r.title);
  if (schedule.length) out.schedule = schedule;
  const story = (c.story ?? [])
    .map((s) => ({
      title: s.title?.trim() ?? "",
      body: s.body?.trim() ?? "",
      pull: s.pull?.trim() ?? "",
      image: s.image?.trim() ?? "",
      alt: s.alt?.trim() ?? "",
    }))
    .filter((s) => s.title && s.body);
  if (story.length) out.story = story;
  if (c.features && typeof c.features === "object") {
    out.features = { ...DEFAULT_FEATURES, ...c.features };
  }
  return out;
}

function Field({ label, hint, ...input }) {
  return (
    <label className="wm-field">
      <span className="wm-field-label">{label}{hint && <em className="host-hint"> — {hint}</em>}</span>
      <input className="wm-input" {...input} />
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="host-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="host-toggle-text">
        <span className="host-toggle-label">{label}</span>
        {hint && <span className="host-toggle-hint">{hint}</span>}
      </span>
    </label>
  );
}

export default function ContentEditor({
  value,
  onChange,
  eventId,
  passcode,
  onHeroPending,
  onHeroUploaded,
}) {
  const c = {
    ...EMPTY_CONTENT,
    features: { ...DEFAULT_FEATURES, ...(value?.features ?? {}) },
    ...value,
  };
  const set = (patch) => onChange({ ...c, ...patch });
  const setFeature = (key, on) => set({ features: { ...c.features, [key]: on } });
  const setRow = (key, i, patch) => {
    const rows = [...(c[key] ?? [])];
    rows[i] = { ...rows[i], ...patch };
    set({ [key]: rows });
  };
  const dropRow = (key, i) => set({ [key]: c[key].filter((_, j) => j !== i) });

  return (
    <div className="host-content">
      <p className="host-content-note">
        Everything here is per event — blank fields stay hidden on the guest page.
        Use the toggles below to turn whole sections on or off.
      </p>

      <fieldset className="host-fieldset">
        <legend>Identity &amp; browser</legend>
        <div className="host-grid">
          <Field label="Headline on hero" hint='e.g. "Sarah" or "Rawad & Maya"' value={c.coupleNames}
            placeholder="Event or couple name" maxLength={80}
            onChange={(e) => set({ coupleNames: e.target.value })} />
          <Field label="Navbar initials" hint='e.g. "S" or "R & M"' value={c.initials}
            placeholder="Auto from headline if blank" maxLength={24}
            onChange={(e) => set({ initials: e.target.value })} />
          <Field label="Date, as displayed" hint='e.g. "12 . 06 . 2026"' value={c.dateDisplay}
            placeholder="12 . 06 . 2026" maxLength={40}
            onChange={(e) => set({ dateDisplay: e.target.value })} />
          <Field label="Browser tab title" hint="full tab label" value={c.pageTitle}
            placeholder="Bride to Be — Share the night" maxLength={80}
            onChange={(e) => set({ pageTitle: e.target.value })} />
        </div>
        <div className="host-grid">
          <Field label="Hashtag" value={c.hashtag} placeholder="#BrideToBe" maxLength={60}
            onChange={(e) => set({ hashtag: e.target.value })} />
          <Field label="Dress code" value={c.dressCode} placeholder="Cocktail · blush tones" maxLength={80}
            onChange={(e) => set({ dressCode: e.target.value })} />
        </div>
        <Field label="Hero line" hint="sentence under the headline" value={c.heroLede}
          placeholder="Capture a moment — it joins the shared gallery the instant you snap it." maxLength={160}
          onChange={(e) => set({ heroLede: e.target.value })} />
      </fieldset>

      <HeroCoverField
        variant="host"
        value={c.heroStorageKey}
        previewUrl={c.heroImageUrl}
        onChange={(heroStorageKey) => set({ heroStorageKey })}
        onUploaded={onHeroUploaded}
        eventId={eventId}
        passcode={passcode}
        onPendingFile={onHeroPending}
      />

      <fieldset className="host-fieldset">
        <legend>Guest page sections</legend>
        <div className="host-toggles">
          {FEATURE_FIELDS.map(({ key, label, hint }) => (
            <Toggle
              key={key}
              label={label}
              hint={hint}
              checked={c.features[key] !== false}
              onChange={(on) => setFeature(key, on)}
            />
          ))}
        </div>
      </fieldset>

      {c.features.schedule !== false && (
        <fieldset className="host-fieldset">
          <legend>Tonight&apos;s flow</legend>
          {(c.schedule ?? []).map((row, i) => (
            <div className="host-row" key={i}>
              <input className="wm-input host-row-time" placeholder="7:00 PM" value={row.time ?? ""}
                maxLength={10} onChange={(e) => setRow("schedule", i, { time: e.target.value })} />
              <input className="wm-input" placeholder="Dinner" value={row.title ?? ""}
                maxLength={60} onChange={(e) => setRow("schedule", i, { title: e.target.value })} />
              <input className="wm-input" placeholder="Toasts at 8:15" value={row.detail ?? ""}
                maxLength={90} onChange={(e) => setRow("schedule", i, { detail: e.target.value })} />
              <button type="button" className="btn btn-text host-row-x" aria-label="Remove schedule row"
                onClick={() => dropRow("schedule", i)}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-text"
            onClick={() => set({ schedule: [...(c.schedule ?? []), { time: "", title: "", detail: "" }] })}>
            + Add a moment to the schedule
          </button>
        </fieldset>
      )}

      <fieldset className="host-fieldset">
        <legend>Story page</legend>
        <p className="host-content-note">
          The Story tab stays visible — customize the headline, or turn off chapters for a mystery teaser.
        </p>
        <Field label="Story page title" value={c.storyTitle}
          placeholder="Still a mystery" maxLength={80}
          onChange={(e) => set({ storyTitle: e.target.value })} />
        <Field label="Story intro line" value={c.storyLede}
          placeholder="The hosts locked this page. Ask nicely at the bar." maxLength={160}
          onChange={(e) => set({ storyLede: e.target.value })} />
      </fieldset>

      {c.features.story !== false && (
        <fieldset className="host-fieldset">
          <legend>Story chapters</legend>
          <p className="host-content-note">
            Optional — leave empty to show guests a mystery teaser on the Story page.
          </p>
          {(c.story ?? []).map((chap, i) => (
            <div className="host-chapter" key={i}>
              <div className="host-chapter-head">
                <input className="wm-input" placeholder={`Chapter ${i + 1} title`}
                  value={chap.title ?? ""} maxLength={80}
                  onChange={(e) => setRow("story", i, { title: e.target.value })} />
                <button type="button" className="btn btn-text host-row-x" aria-label="Remove chapter"
                  onClick={() => dropRow("story", i)}>✕</button>
              </div>
              <textarea className="wm-input host-textarea" rows={3} maxLength={600}
                placeholder="A few sentences guests will actually read…"
                value={chap.body ?? ""} onChange={(e) => setRow("story", i, { body: e.target.value })} />
              <input className="wm-input" placeholder="Pull quote (optional)" value={chap.pull ?? ""}
                maxLength={120} onChange={(e) => setRow("story", i, { pull: e.target.value })} />
            </div>
          ))}
          <button type="button" className="btn btn-text"
            onClick={() => set({ story: [...(c.story ?? []), { title: "", body: "", pull: "" }] })}>
            + Add a chapter
          </button>
        </fieldset>
      )}
    </div>
  );
}
