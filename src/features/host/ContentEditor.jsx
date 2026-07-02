import React, { useEffect, useId, useRef, useState } from "react";
import { adminUploadHeroImage } from '@/services/api/index.js';

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

/** Resize + re-encode before upload — keeps hero fast on mobile guest pages. */
async function prepareHeroBlob(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1920;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

function HeroImageField({ value, onChange, eventId, passcode, onPendingFile }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");

  useEffect(() => {
    setPreview(value || "");
  }, [value]);

  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const blob = await prepareHeroBlob(file);
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));

      if (eventId && passcode) {
        const res = await adminUploadHeroImage(eventId, blob, passcode);
        onChange(res.url);
        setPreview(res.url);
        setPendingName("");
        onPendingFile?.(null);
      } else {
        onPendingFile?.(blob);
        setPendingName(file.name);
        onChange("");
      }
    } catch (err) {
      setError(err.message || "Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  }

  function clearImage() {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview("");
    setPendingName("");
    onChange("");
    onPendingFile?.(null);
    setError("");
  }

  const canUploadNow = Boolean(eventId && passcode);
  const showPreview = Boolean(preview || pendingName);

  return (
    <div className="host-hero-upload">
      <span className="wm-field-label">
        Hero cover photo<em className="host-hint"> — full-screen background</em>
      </span>

      {showPreview ? (
        <div className="host-hero-preview">
          {preview ? (
            <img src={preview} alt="Hero cover preview" />
          ) : (
            <div className="host-hero-preview-empty">{pendingName}</div>
          )}
          <div className="host-hero-preview-actions">
            <button type="button" className="btn btn-text" disabled={busy}
              onClick={() => inputRef.current?.click()}>
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button type="button" className="btn btn-text" disabled={busy} onClick={clearImage}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="host-hero-pick"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : "Choose from your files"}
        </button>
      )}

      {!canUploadNow && !showPreview && (
        <p className="host-content-note">
          For a new event, pick an image now — it uploads right after you create the event.
        </p>
      )}
      {pendingName && !canUploadNow && (
        <p className="host-content-note">Ready to upload: {pendingName}</p>
      )}
      {error && <p className="host-error" role="alert">{error}</p>}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="host-hero-input"
        onChange={onPick}
      />
    </div>
  );
}

export default function ContentEditor({
  value,
  onChange,
  eventId,
  passcode,
  onHeroPending,
}) {
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

      <HeroImageField
        value={c.heroImageUrl}
        onChange={(heroImageUrl) => set({ heroImageUrl })}
        eventId={eventId}
        passcode={passcode}
        onPendingFile={onHeroPending}
      />

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
