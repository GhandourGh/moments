import React from "react";

/**
 * Per-event content form — the fields that drive the guest frontend
 * (hero, schedule, story). Controlled by the parent via `value`/`onChange`,
 * where `value` is the raw content document stored in events.content.
 * Every field is optional: blank fields fall back to the app defaults.
 */

export const EMPTY_CONTENT = {
  coupleNames: "",
  dateDisplay: "",
  hashtag: "",
  heroLede: "",
  heroImageUrl: "",
  dressCode: "",
  schedule: [],
  story: [],
};

/** Strip empty fields/rows so the stored document only holds real overrides. */
export function cleanContent(c) {
  const out = {};
  for (const key of ["coupleNames", "dateDisplay", "hashtag", "heroLede", "heroImageUrl", "dressCode"]) {
    const v = (c[key] ?? "").trim();
    if (v) out[key] = v;
  }
  const schedule = (c.schedule ?? [])
    .map((r) => ({ time: r.time?.trim() ?? "", title: r.title?.trim() ?? "", detail: r.detail?.trim() ?? "" }))
    .filter((r) => r.time && r.title);
  if (schedule.length) out.schedule = schedule;
  const story = (c.story ?? [])
    .map((s) => ({ title: s.title?.trim() ?? "", body: s.body?.trim() ?? "", pull: s.pull?.trim() ?? "" }))
    .filter((s) => s.title && s.body);
  if (story.length) out.story = story;
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

export default function ContentEditor({ value, onChange }) {
  const c = { ...EMPTY_CONTENT, ...value };
  const set = (patch) => onChange({ ...c, ...patch });
  const setRow = (key, i, patch) => {
    const rows = [...(c[key] ?? [])];
    rows[i] = { ...rows[i], ...patch };
    set({ [key]: rows });
  };
  const dropRow = (key, i) => set({ [key]: c[key].filter((_, j) => j !== i) });

  return (
    <div className="host-content">
      <p className="host-content-note">
        Everything below is optional — blank fields use the app's stock copy.
      </p>

      <div className="host-grid">
        <Field label="Couple / headline" hint='e.g. "Rawad & Maya"' value={c.coupleNames}
          placeholder="Rawad & Maya" maxLength={80}
          onChange={(e) => set({ coupleNames: e.target.value })} />
        <Field label="Date, as displayed" hint='e.g. "12 . 06 . 2026"' value={c.dateDisplay}
          placeholder="12 . 06 . 2026" maxLength={40}
          onChange={(e) => set({ dateDisplay: e.target.value })} />
        <Field label="Hashtag" value={c.hashtag} placeholder="#RawadAndMaya" maxLength={60}
          onChange={(e) => set({ hashtag: e.target.value })} />
        <Field label="Dress code" value={c.dressCode} placeholder="Garden formal · earth tones" maxLength={80}
          onChange={(e) => set({ dressCode: e.target.value })} />
      </div>
      <Field label="Hero line" hint="the sentence under the names" value={c.heroLede}
        placeholder="Capture a moment — it joins the shared gallery the instant you snap it." maxLength={160}
        onChange={(e) => set({ heroLede: e.target.value })} />
      <Field label="Hero image URL" hint="full-screen cover photo" value={c.heroImageUrl}
        placeholder="https://…/cover.jpg" maxLength={500}
        onChange={(e) => set({ heroImageUrl: e.target.value })} />

      <fieldset className="host-fieldset">
        <legend>Schedule</legend>
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

      <fieldset className="host-fieldset">
        <legend>Story chapters</legend>
        {(c.story ?? []).map((chap, i) => (
          <div className="host-chapter" key={i}>
            <div className="host-chapter-head">
              <input className="wm-input" placeholder={`Chapter ${i + 1} title — "How we met"`}
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
    </div>
  );
}
