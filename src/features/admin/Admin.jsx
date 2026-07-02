import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import HeroCoverField from '@/components/HeroCoverField.jsx';
import { cleanContent, EMPTY_CONTENT } from '@/features/host/ContentEditor.jsx';
import {
  adminDeletePhoto,
  adminListEvents,
  adminListPhotos,
  adminUpdateEvent,
  fetchEvent,
} from '@/services/api/index.js';
import { ADMIN_PASSCODE_KEY } from '@/config/admin.js';

const TABS = [
  { id: "cover", label: "Cover photo" },
  { id: "photos", label: "Guest photos" },
];

/**
 * /admin — event dashboard: hero cover, photo moderation.
 * Uses the same ADMIN_PASSCODE as /host (Vercel env ADMIN_PASSCODE).
 */
export default function Admin() {
  const [passcode, setPasscode] = useState(() => {
    try { return sessionStorage.getItem(ADMIN_PASSCODE_KEY) ?? ""; } catch { return ""; }
  });
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("cover");

  const loadEvents = useCallback(async (code) => {
    const res = await adminListEvents(code);
    setEvents(res.events ?? []);
    return res.events ?? [];
  }, []);

  async function unlock(e) {
    e?.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError("");
    try {
      const list = await loadEvents(passcode);
      try { sessionStorage.setItem(ADMIN_PASSCODE_KEY, passcode); } catch { /* private mode */ }
      setUnlocked(true);
      if (list.length === 1) setSelectedId(list[0].id);
    } catch (err) {
      setError(err.status === 401 ? "Wrong passcode." : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (passcode && !unlocked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Dashboard</h1>
          <p className="admin-lede">
            Manage the guest-page cover and review photos for each event.
          </p>
        </div>
        {unlocked && (
          <Link to="/host" className="btn btn-text admin-host-link">Host tools</Link>
        )}
      </header>

      {!unlocked ? (
        <form className="admin-card" onSubmit={unlock}>
          <label className="wm-field">
            <span className="wm-field-label">Passcode</span>
            <input
              type="password"
              className="wm-input"
              value={passcode}
              onChange={(ev) => setPasscode(ev.target.value)}
              autoComplete="current-password"
              placeholder="Your admin passcode"
            />
          </label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Enter dashboard"}
          </button>
        </form>
      ) : (
        <>
          <section className="admin-card admin-events-panel" aria-label="Events">
            <div className="admin-events-head">
              <h2 className="admin-section-title">Your events</h2>
              <button type="button" className="btn btn-text" onClick={() => loadEvents(passcode).catch(() => {})}>
                Refresh
              </button>
            </div>
            {!events.length ? (
              <p className="admin-muted">No events yet. Create one in Host tools.</p>
            ) : (
              <ul className="admin-event-list">
                {events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`admin-event-card${e.id === selectedId ? " is-selected" : ""}`}
                      onClick={() => { setSelectedId(e.id); setTab("cover"); }}
                    >
                      <span className="admin-event-card-title">{e.title}</span>
                      <span className="admin-event-card-meta">
                        {e.photos} photo{e.photos === 1 ? "" : "s"}
                        {" · "}{e.guests} guest{e.guests === 1 ? "" : "s"}
                      </span>
                      <span className="admin-event-card-date">
                        {new Date(e.startsAt).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected ? (
            <>
              <div className="admin-event-bar">
                <div>
                  <h2 className="admin-event-bar-title">{selected.title}</h2>
                  <p className="admin-event-bar-meta">
                    <a href={`/e/${encodeURIComponent(selected.slug)}`} target="_blank" rel="noreferrer">
                      Open guest page ↗
                    </a>
                    {" · "}{selected.slug}
                  </p>
                </div>
              </div>

              <nav className="admin-tabs" aria-label="Event sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`admin-tab${tab === t.id ? " is-active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.id === "photos" && (
                      <span className="admin-tab-count">{selected.photos}</span>
                    )}
                  </button>
                ))}
              </nav>

              {tab === "cover" ? (
                <EventCoverPanel event={selected} passcode={passcode} />
              ) : (
                <PhotoGallery
                  event={selected}
                  passcode={passcode}
                  onPhotoDeleted={() => {
                    setEvents((evts) => evts.map((e) => (
                      e.id === selected.id ? { ...e, photos: Math.max(0, e.photos - 1) } : e
                    )));
                  }}
                />
              )}
            </>
          ) : (
            <div className="admin-card admin-empty">
              <p className="admin-empty-title">Pick an event</p>
              <p className="admin-muted">Select an event above to manage its cover photo and gallery.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventCoverPanel({ event, passcode }) {
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setContent(null);
    setLoadError("");
    setSaveError("");
    try {
      const res = await fetchEvent(event.slug);
      const c = { ...EMPTY_CONTENT, ...(res.event.content ?? {}) };
      setContent(c);
    } catch (err) {
      setLoadError(err.message || "Couldn't load event details.");
    }
  }, [event.slug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  async function saveHero(nextContent) {
    const cleaned = cleanContent(nextContent);
    setBusy(true);
    setSaveError("");
    try {
      const res = await adminUpdateEvent(event.id, { content: cleaned }, passcode);
      setContent({ ...EMPTY_CONTENT, ...(res.event.content ?? {}) });
      setNotice("Cover saved — guests will see it on the Tonight page.");
    } catch (err) {
      setSaveError(err.message || "Uploaded but couldn't save. Try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onHeroUploaded(upload) {
    const next = upload?.storageKey
      ? { ...content, heroStorageKey: upload.storageKey, heroImageUrl: upload.url }
      : { ...content, heroStorageKey: "", heroImageUrl: "" };
    setContent(next);
    try {
      await saveHero(next);
      if (!upload) setNotice("Cover removed.");
    } catch { /* saveError set in saveHero */ }
  }

  if (loadError) {
    return (
      <div className="admin-card admin-state">
        <p className="admin-error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-text" onClick={load}>Retry</button>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="admin-card admin-state">
        <p className="admin-muted">Loading cover…</p>
      </div>
    );
  }

  return (
    <div className="admin-card admin-cover-panel">
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <HeroCoverField
        variant="admin"
        value={content.heroStorageKey}
        previewUrl={content.heroImageUrl}
        onChange={(heroStorageKey) => setContent((c) => ({ ...c, heroStorageKey }))}
        onUploaded={onHeroUploaded}
        eventId={event.id}
        passcode={passcode}
      />
      {busy && <p className="admin-muted">Saving…</p>}
      {saveError && <p className="admin-error" role="alert">{saveError}</p>}
      <p className="admin-cover-foot">
        Tip: use a wide landscape photo (1920px or wider works best).
        {" "}
        <a href={`/e/${encodeURIComponent(event.slug)}`} target="_blank" rel="noreferrer">
          Preview on guest page ↗
        </a>
      </p>
    </div>
  );
}

function PhotoGallery({ event, passcode, onPhotoDeleted }) {
  const [photos, setPhotos] = useState(null);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [armed, setArmed] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setPhotos(null);
    setLoadError("");
    setActionError("");
    setArmed(null);
    setPreview(null);
    try {
      const res = await adminListPhotos(event.id, passcode);
      setPhotos(res.photos ?? []);
      setTotal(res.total ?? (res.photos?.length ?? 0));
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      setLoadError(err.message || "Couldn't load photos.");
    }
  }, [event.id, passcode]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  async function handleDelete(photo, ev) {
    ev.stopPropagation();
    if (armed !== photo.id) {
      setArmed(photo.id);
      return;
    }
    setArmed(null);
    setDeletingId(photo.id);
    setActionError("");
    try {
      await adminDeletePhoto(event.id, photo.id, passcode);
      setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
      setTotal((t) => Math.max(0, t - 1));
      if (preview?.id === photo.id) setPreview(null);
      onPhotoDeleted();
    } catch (err) {
      setActionError(err.message || "Couldn't delete that photo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function loadMore() {
    setMoreBusy(true);
    setActionError("");
    try {
      const res = await adminListPhotos(event.id, passcode, { cursor: nextCursor });
      setPhotos((ps) => [...ps, ...(res.photos ?? [])]);
      if (res.total != null) setTotal(res.total);
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      setActionError(err.message || "Couldn't load more photos.");
    } finally {
      setMoreBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="admin-card admin-state">
        <p className="admin-error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-text" onClick={load}>Retry</button>
      </div>
    );
  }

  if (photos === null) {
    return (
      <div className="admin-card admin-state">
        <p className="admin-muted">Loading photos…</p>
      </div>
    );
  }

  return (
    <>
      <div className="admin-card admin-gallery">
        <div className="admin-gallery-head">
          <p className="admin-gallery-lede">
            Tap a photo to preview. Delete removes it from the guest gallery immediately.
          </p>
          <span className="admin-gallery-count">
            {total} photo{total === 1 ? "" : "s"}
          </span>
          <button type="button" className="btn btn-text" onClick={load}>Refresh</button>
        </div>

        {!photos.length ? (
          <div className="admin-gallery-empty">
            <p className="admin-empty-title">No guest photos yet</p>
            <p className="admin-muted">Photos appear here when guests capture moments on the event page.</p>
          </div>
        ) : (
          <ul className="admin-grid">
            {photos.map((p) => (
              <li key={p.id} className="admin-thumb">
                <button
                  type="button"
                  className="admin-thumb-btn"
                  onClick={() => setPreview(p)}
                  aria-label={guestLabel(p)}
                >
                  {p.url ? (
                    <img src={p.url} loading="lazy" alt="" />
                  ) : (
                    <span className="admin-thumb-placeholder" aria-hidden />
                  )}
                  <span className="admin-thumb-meta">
                    {p.guest?.firstName ? `${p.guest.firstName} ${p.guest.lastName ?? ""}`.trim() : "Guest"}
                    {p.takenAt ? ` · ${new Date(p.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className={`admin-thumb-del${armed === p.id ? " is-armed" : ""}`}
                  disabled={deletingId === p.id}
                  aria-label={armed === p.id ? "Confirm delete" : "Delete photo"}
                  onClick={(ev) => handleDelete(p, ev)}
                >
                  {deletingId === p.id ? "…" : armed === p.id ? "Delete?" : "✕"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {actionError && <p className="admin-error" role="alert">{actionError}</p>}
        {nextCursor && (
          <button type="button" className="btn btn-text admin-load-more" disabled={moreBusy} onClick={loadMore}>
            {moreBusy ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {preview && (
        <div className="admin-preview" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div className="admin-preview-inner" onClick={(ev) => ev.stopPropagation()}>
            {preview.url ? (
              <img src={preview.url} alt={guestLabel(preview)} />
            ) : (
              <div className="admin-preview-missing">Image unavailable</div>
            )}
            <div className="admin-preview-bar">
              <span>{guestLabel(preview)}</span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deletingId === preview.id}
                onClick={(ev) => handleDelete(preview, ev)}
              >
                {deletingId === preview.id ? "Deleting…" : armed === preview.id ? "Confirm delete" : "Delete"}
              </button>
              <button type="button" className="btn btn-text" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function guestLabel(p) {
  const name = p.guest?.firstName
    ? `${p.guest.firstName} ${p.guest.lastName ?? ""}`.trim()
    : "Guest photo";
  if (!p.takenAt) return name;
  return `${name} · ${new Date(p.takenAt).toLocaleString()}`;
}
