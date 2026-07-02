import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminDeletePhoto,
  adminListEvents,
  adminListPhotos,
} from '@/services/api/index.js';
import { ADMIN_PASSCODE_KEY } from '@/config/admin.js';

/**
 * /admin — simple dashboard: pick an event, browse photos, delete if needed.
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
          <h1 className="admin-title">Admin</h1>
          <p className="admin-lede">Browse event photos and remove anything you don't want live.</p>
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
          <button className="btn btn-primary" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      ) : (
        <>
          <div className="admin-card admin-picker">
            <label className="wm-field">
              <span className="wm-field-label">Event</span>
              <select
                className="wm-input admin-select"
                value={selectedId}
                onChange={(ev) => setSelectedId(ev.target.value)}
              >
                <option value="">Choose an event…</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {e.photos} photo{e.photos === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <p className="admin-event-meta">
                <a href={`/e/${encodeURIComponent(selected.slug)}`} target="_blank" rel="noreferrer">
                  Open guest page ↗
                </a>
                {" · "}
                {new Date(selected.startsAt).toLocaleDateString()}
                {" · "}{selected.guests} guest{selected.guests === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {selected ? (
            <PhotoGallery
              event={selected}
              passcode={passcode}
              onPhotoDeleted={() => {
                setEvents((evts) => evts.map((e) => (
                  e.id === selected.id ? { ...e, photos: Math.max(0, e.photos - 1) } : e
                )));
              }}
            />
          ) : (
            <div className="admin-card admin-empty">
              <p>Select an event above to see its photos.</p>
            </div>
          )}
        </>
      )}
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
          <h2 className="admin-gallery-title">{event.title}</h2>
          <span className="admin-gallery-count">
            {total} photo{total === 1 ? "" : "s"}
          </span>
          <button type="button" className="btn btn-text" onClick={load}>Refresh</button>
        </div>

        {!photos.length ? (
          <p className="admin-muted">No photos yet for this event.</p>
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
                  <img
                    src={p.url}
                    loading="lazy"
                    alt=""
                  />
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
          <button type="button" className="btn btn-text" disabled={moreBusy} onClick={loadMore}>
            {moreBusy ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {preview && (
        <div className="admin-preview" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div className="admin-preview-inner" onClick={(ev) => ev.stopPropagation()}>
            <img src={preview.url} alt={guestLabel(preview)} />
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
