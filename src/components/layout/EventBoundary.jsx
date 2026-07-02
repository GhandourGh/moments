import React, { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { setActiveEvent, getLastEvent } from '@/state/activeEvent.js';
import { createSession, getEvent } from '@/services/api/index.js';
import { setEventContent } from '@/state/eventContent.js';
import { getGuest } from '@/state/guest.js';
import { warmup as warmupFaces } from '@/services/faces/index.js';

// Face models are event-agnostic — pull them once per page load, not per slug.
let facesWarmed = false;

/**
 * Route boundary for /e/:eventSlug. Binds the API client to the slug BEFORE
 * any child renders (so every fetch a child fires is scoped to the right
 * event), loads the event's content, re-binds the session cookie on slug
 * change, and swaps the PWA manifest to the per-event one.
 *
 * Children render optimistically on the stock content defaults while the
 * event loads; a 404 swaps the whole subtree for an "event not found" page.
 *
 * The Outlet is keyed by slug so switching events remounts Layout and
 * everything under it — PhotosProvider and friends reset cleanly instead
 * of leaking the previous event's shots.
 */
export default function EventBoundary() {
  const { eventSlug } = useParams();
  // The slug the backend 404'd on — stored as a slug (not a boolean) so
  // navigating to a different event never flashes the stale 404 screen.
  const [missingSlug, setMissingSlug] = useState("");

  // useMemo (not an effect) so the store is updated during render, before
  // children mount and start firing API calls that read getEventId().
  useMemo(() => setActiveEvent(eventSlug), [eventSlug]);

  useEffect(() => {
    let cancelled = false;

    // Re-bind the moment.sid cookie to this event. Guests without a name yet
    // get their session from the welcome modal instead.
    if (getGuest()) {
      createSession()
        .then((r) => {
          // "no-backend" is normal in local-only mode — only real failures warn.
          if (!r.ok && r.reason !== "no-backend") {
            console.warn("[event] session create failed:", r.reason);
          }
        })
        .catch((err) => console.warn("[event] session create failed:", err));
    }

    getEvent()
      .then((r) => {
        if (!cancelled && r.ok) setEventContent(r.event);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.status === 404) setMissingSlug(eventSlug);
        else console.warn("[event] event load failed:", err);
      });

    if (!facesWarmed) {
      facesWarmed = true;
      warmupFaces();
    }

    return () => { cancelled = true; };
  }, [eventSlug]);

  // Per-event PWA manifest (start_url "/e/<slug>") so an installed app
  // reopens on the right event. The static manifest stays the default for
  // /host and non-event pages — restore it on unmount.
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return undefined;
    const original = link.getAttribute("href");
    link.setAttribute("href", `/api/manifest?event=${encodeURIComponent(eventSlug)}`);
    return () => { link.setAttribute("href", original); };
  }, [eventSlug]);

  if (missingSlug === eventSlug) return <EventMissing slug={eventSlug} />;

  return <Outlet key={eventSlug} />;
}

function EventMissing({ slug }) {
  const last = getLastEvent();
  const fallback = last && last !== slug ? `/e/${last}` : "/host";
  const label = last && last !== slug ? "Back to your event" : "Go to host tools";
  return (
    <section className="page-section nf">
      <h1 className="nf-title">Event not found.</h1>
      <p className="nf-body">
        There's no event at &ldquo;{slug}&rdquo;. Double-check the link or
        scan the QR code again.
      </p>
      <Link to={fallback} className="btn btn-primary">{label}</Link>
    </section>
  );
}
