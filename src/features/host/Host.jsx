import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  adminCreateEvent,
  adminDeleteEvent,
  adminDeletePhoto,
  adminListEvents,
  adminListPhotos,
  adminUpdateEvent,
  fetchEvent,
} from '@/services/api/index.js';
import ContentEditor, { EMPTY_CONTENT, cleanContent } from '@/features/host/ContentEditor.jsx';

const PASSCODE_KEY = "moment.host.passcode.v1";
const LIST_POLL_MS = 15_000;

/**
 * /host — the event-creation flow for hosts. Protected by the ADMIN_PASSCODE
 * env var on the server (simple passcode, no accounts — per project decision).
 * The passcode is kept in sessionStorage only, so closing the tab forgets it.
 *
 * Deliberately outside <Layout/>: hosts shouldn't hit the guest welcome gate.
 */
export default function Host() {
  const [passcode, setPasscode] = useState(() => {
    try { return sessionStorage.getItem(PASSCODE_KEY) ?? ""; } catch { return ""; }
  });
  const [unlocked, setUnlocked] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(null);

  const refresh = useCallback(async (code) => {
    const res = await adminListEvents(code);
    setEvents(res.events);
    setListError("");
  }, []);

  async function unlock(e) {
    e?.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError("");
    try {
      await refresh(passcode);
      try { sessionStorage.setItem(PASSCODE_KEY, passcode); } catch { /* private mode */ }
      setUnlocked(true);
    } catch (err) {
      setError(err.status === 401 ? "Wrong passcode." : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  // Re-unlock silently when the passcode survived in sessionStorage.
  useEffect(() => {
    if (passcode && !unlocked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While unlocked, poll the list so guest/photo counts stay live. Rows are
  // keyed by event id, so replacing the array updates counts in place without
  // re-mounting open panels. Paused while the tab is hidden.
  useEffect(() => {
    if (!unlocked) return undefined;
    const tick = () => {
      if (document.hidden) return;
      refresh(passcode).catch(() => setListError("Couldn't refresh the event list."));
    };
    const id = setInterval(tick, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [unlocked, passcode, refresh]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  /** Patch one row in place (live count merges, post-save updates). */
  const patchEventRow = useCallback((id, patch) => {
    setEvents((evts) => evts.map((e) => (
      e.id === id ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e
    )));
  }, []);

  const removeEventRow = useCallback((id, note) => {
    setEvents((evts) => evts.filter((e) => e.id !== id));
    if (note) {
      setNotice(note);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 8000);
    }
  }, []);

  return (
    <section className="page-section host">
      <header className="section-head">
        <h1 className="section-title">Host tools</h1>
        <p className="section-lede">
          Create an event and share its link — guests need nothing but the URL.
        </p>
      </header>

      {!unlocked ? (
        <form className="host-card" onSubmit={unlock}>
          <label className="wm-field">
            <span className="wm-field-label">Host passcode</span>
            <input
              type="password"
              className="wm-input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="host-error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      ) : (
        <>
          <CreateEventForm
            passcode={passcode}
            onCreated={() => refresh(passcode).catch(() => setListError("Couldn't refresh the event list."))}
          />
          <EventList
            events={events}
            passcode={passcode}
            listError={listError}
            notice={notice}
            onRetry={() => refresh(passcode).catch(() => setListError("Couldn't refresh the event list."))}
            onEventPatched={patchEventRow}
            onEventDeleted={removeEventRow}
          />
        </>
      )}
    </section>
  );
}

function CreateEventForm({ passcode, onCreated }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await adminCreateEvent({
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        content: cleanContent(content),
      }, passcode);
      setCreated(res.event);
      setTitle(""); setStartsAt(""); setEndsAt(""); setContent(EMPTY_CONTENT);
      onCreated();
    } catch (err) {
      setError(
        err.code === "conflict" ? "That slug already exists — pick another title." :
        err.message || "Couldn't create the event."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="host-card" onSubmit={submit}>
        <h2 className="host-card-title">New event</h2>
        <label className="wm-field">
          <span className="wm-field-label">Title</span>
          <input className="wm-input" value={title} maxLength={120} required
            placeholder="Rawad & Maya" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="host-dates">
          <label className="wm-field">
            <span className="wm-field-label">Starts</span>
            <input type="datetime-local" className="wm-input" value={startsAt} required
              onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="wm-field">
            <span className="wm-field-label">Ends</span>
            <input type="datetime-local" className="wm-input" value={endsAt} required
              onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <ContentEditor value={content} onChange={setContent} />
        {error && <p className="host-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !title || !startsAt || !endsAt}>
          {busy ? "Creating…" : "Create event"}
        </button>
      </form>
      {created && <ShareCard event={created} />}
    </>
  );
}

function guestLink(slug) {
  return `${window.location.origin}/e/${encodeURIComponent(slug)}`;
}

/** ISO timestamp → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ShareCard({ event }) {
  const link = useMemo(() => guestLink(event.slug), [event.slug]);
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQr("");
    setQrError(false);
    QRCode.toDataURL(link, { width: 480, margin: 1 })
      .then((data) => { if (!cancelled) setQr(data); })
      .catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the link is visible to select manually */ }
  }

  return (
    <div className="host-card host-share">
      <h2 className="host-card-title">{event.title} is live</h2>
      {qr && <img className="host-qr" src={qr} alt={`QR code linking to ${event.title}`} />}
      {qrError && (
        <p className="host-content-note" role="alert">
          The QR code couldn't be generated — share the link below instead.
        </p>
      )}
      <p className="host-link">{link}</p>
      <div className="host-share-actions">
        <button className="btn btn-primary" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
        {qr && <a className="btn btn-text" href={qr} download={`${event.slug}-qr.png`}>Download QR</a>}
      </div>
    </div>
  );
}

function EventList({ events, passcode, listError, notice, onRetry, onEventPatched, onEventDeleted }) {
  const [open, setOpen] = useState(null); // { id, tab: "edit" | "share" | "photos" }

  const toggle = (id, tab) =>
    setOpen((o) => (o && o.id === id && o.tab === tab ? null : { id, tab }));

  const tabLabel = (e, tab, label) =>
    open?.id === e.id && open.tab === tab ? "Close" : label;

  return (
    <div className="host-card">
      <h2 className="host-card-title">Events</h2>
      {notice && <p className="host-notice" role="status">{notice}</p>}
      {listError && (
        <p className="host-error" role="alert">
          {listError}{" "}
          <button type="button" className="btn btn-text" onClick={onRetry}>Retry</button>
        </p>
      )}
      {!events.length ? (
        <p className="host-content-note">No events yet — create your first above.</p>
      ) : (
        <ul className="host-events">
          {events.map((e) => (
            <li key={e.id} className="host-event">
              <div className="host-event-row">
                <div className="host-event-main">
                  <span className="host-event-title">{e.title}</span>
                  <span className="host-event-meta">
                    {new Date(e.startsAt).toLocaleDateString()}
                    {" · "}{e.guests} guest{e.guests === 1 ? "" : "s"}
                    {" · "}{e.photos} photo{e.photos === 1 ? "" : "s"}
                    {" · "}{e.videos ?? 0} video{(e.videos ?? 0) === 1 ? "" : "s"}
                  </span>
                  <a className="host-event-open" href={guestLink(e.slug)} target="_blank" rel="noreferrer">
                    Open guest page ↗
                  </a>
                </div>
                <div className="host-event-actions">
                  <button className="btn btn-text" onClick={() => toggle(e.id, "edit")}>
                    {tabLabel(e, "edit", "Edit")}
                  </button>
                  <button className="btn btn-text" onClick={() => toggle(e.id, "share")}>
                    {tabLabel(e, "share", "Share")}
                  </button>
                  <button className="btn btn-text" onClick={() => toggle(e.id, "photos")}>
                    {tabLabel(e, "photos", "Photos")}
                  </button>
                </div>
              </div>
              {open?.id === e.id && open.tab === "share" && <ShareCard event={e} />}
              {open?.id === e.id && open.tab === "edit" && (
                <EditEventPanel
                  passcode={passcode}
                  event={e}
                  onSaved={(updated) => {
                    if (updated) {
                      onEventPatched(e.id, {
                        title: updated.title ?? e.title,
                        startsAt: updated.startsAt ?? e.startsAt,
                        endsAt: updated.endsAt ?? e.endsAt,
                      });
                    }
                    setOpen(null);
                  }}
                  onDeleted={onEventDeleted}
                />
              )}
              {open?.id === e.id && open.tab === "photos" && (
                <PhotosPanel
                  event={e}
                  passcode={passcode}
                  onPhotoDeleted={() =>
                    onEventPatched(e.id, (row) => ({ photos: Math.max(0, row.photos - 1) }))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditEventPanel({ passcode, event, onSaved, onDeleted }) {
  // original === null while loading; loadError set on fetch failure. Saving is
  // impossible until the load succeeds, so a failed load can never wipe the
  // event's stored content with an empty form.
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setOriginal(null);
    setLoadError("");
    (async () => {
      try {
        const res = await fetchEvent(event.slug);
        if (cancelled) return;
        const ev = res.event;
        const c = { ...EMPTY_CONTENT, ...(ev.content ?? {}) };
        const starts = toLocalInput(ev.startsAt);
        const ends = toLocalInput(ev.endsAt);
        setTitle(ev.title ?? "");
        setStartsAt(starts);
        setEndsAt(ends);
        setContent(c);
        setOriginal({
          title: ev.title ?? "",
          startsAt: starts,
          endsAt: ends,
          content: JSON.stringify(cleanContent(c)),
        });
      } catch {
        if (!cancelled) setLoadError("Couldn't load this event's details.");
      }
    })();
    return () => { cancelled = true; };
  }, [event.slug, attempt]);

  async function save(e) {
    e.preventDefault();
    if (!original) return;
    const patch = {};
    if (title !== original.title) patch.title = title;
    if (startsAt !== original.startsAt && startsAt) patch.startsAt = new Date(startsAt).toISOString();
    if (endsAt !== original.endsAt && endsAt) patch.endsAt = new Date(endsAt).toISOString();
    const cleaned = cleanContent(content);
    if (JSON.stringify(cleaned) !== original.content) patch.content = cleaned;
    if (!Object.keys(patch).length) {
      onSaved(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await adminUpdateEvent(event.id, patch, passcode);
      onSaved(res.event);
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="host-panel">
      {loadError ? (
        <div className="host-panel-state">
          <p className="host-error" role="alert">{loadError}</p>
          <button type="button" className="btn btn-text" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : !original ? (
        <p className="host-content-note">Loading {event.title}…</p>
      ) : (
        <form onSubmit={save} className="host-edit-form">
          <h3 className="host-card-title">Edit “{event.title}”</h3>
          <label className="wm-field">
            <span className="wm-field-label">Title</span>
            <input className="wm-input" value={title} maxLength={120} required
              onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="host-dates">
            <label className="wm-field">
              <span className="wm-field-label">Starts</span>
              <input type="datetime-local" className="wm-input" value={startsAt} required
                onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="wm-field">
              <span className="wm-field-label">Ends</span>
              <input type="datetime-local" className="wm-input" value={endsAt} required
                onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <label className="wm-field">
            <span className="wm-field-label">
              Slug <em className="host-hint">— locked: it's baked into printed QR codes</em>
            </span>
            <input className="wm-input host-input-locked" value={event.slug} readOnly tabIndex={-1} />
          </label>
          <ContentEditor value={content} onChange={setContent} />
          {error && <p className="host-error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </form>
      )}
      <DeleteEventSection event={event} passcode={passcode} onDeleted={onDeleted} />
    </div>
  );
}

function DeleteEventSection({ event, passcode, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await adminDeleteEvent(event.id, passcode);
      const photos = res.deletedPhotos ?? 0;
      const videos = res.deletedVideos ?? 0;
      onDeleted(
        event.id,
        `Deleted “${event.title}” — ${photos} photo${photos === 1 ? "" : "s"}` +
        (videos ? ` and ${videos} video${videos === 1 ? "" : "s"}` : "") +
        " removed."
      );
    } catch (err) {
      setError(err.message || "Couldn't delete the event.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="host-danger-toggle">
        <button type="button" className="btn btn-text host-danger-link" onClick={() => setOpen(true)}>
          Delete event…
        </button>
      </div>
    );
  }

  return (
    <div className="host-danger">
      <p className="host-danger-note">
        This permanently deletes <strong>{event.title}</strong> — every photo, video and guest
        record is gone for good. Type the slug <code>{event.slug}</code> to confirm.
      </p>
      <div className="host-danger-row">
        <input
          className="wm-input"
          value={confirmText}
          placeholder={event.slug}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setConfirmText(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || confirmText !== event.slug}
          onClick={confirm}
        >
          {busy ? "Deleting…" : "Delete forever"}
        </button>
        <button type="button" className="btn btn-text" disabled={busy}
          onClick={() => { setOpen(false); setConfirmText(""); setError(""); }}>
          Cancel
        </button>
      </div>
      {error && <p className="host-error" role="alert">{error}</p>}
    </div>
  );
}

function PhotosPanel({ event, passcode, onPhotoDeleted }) {
  const [photos, setPhotos] = useState(null); // null = initial load in flight
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState(""); // delete / load-more failures
  const [moreBusy, setMoreBusy] = useState(false);
  const [armed, setArmed] = useState(null); // photo id awaiting the confirm tap
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setPhotos(null);
    setLoadError("");
    setActionError("");
    setArmed(null);
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

  // An armed delete disarms itself after a few seconds of inaction.
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  async function handleDelete(photo) {
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
      <div className="host-panel host-panel-state">
        <p className="host-error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-text" onClick={load}>Retry</button>
      </div>
    );
  }

  if (photos === null) {
    return (
      <div className="host-panel host-panel-state">
        <p className="host-content-note">Loading photos…</p>
      </div>
    );
  }

  return (
    <div className="host-panel">
      <div className="host-photos-head">
        <span className="host-photos-count">
          {total} photo{total === 1 ? "" : "s"}
        </span>
        <button type="button" className="btn btn-text" onClick={load}>Refresh</button>
      </div>
      {!photos.length ? (
        <p className="host-content-note">No photos yet.</p>
      ) : (
        <ul className="host-photo-grid">
          {photos.map((p) => (
            <li key={p.id} className="host-photo">
              <img
                src={p.url}
                loading="lazy"
                alt={p.takenAt ? `Photo taken ${new Date(p.takenAt).toLocaleString()}` : "Event photo"}
              />
              <button
                type="button"
                className={`host-photo-del${armed === p.id ? " is-armed" : ""}`}
                disabled={deletingId === p.id}
                aria-label={armed === p.id ? "Confirm delete photo" : "Delete photo"}
                onClick={() => handleDelete(p)}
              >
                {deletingId === p.id ? "…" : armed === p.id ? "Delete?" : "✕"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {actionError && <p className="host-error" role="alert">{actionError}</p>}
      {nextCursor && (
        <button type="button" className="btn btn-text" disabled={moreBusy} onClick={loadMore}>
          {moreBusy ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
