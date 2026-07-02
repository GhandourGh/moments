import React from "react";
import { Link } from "react-router-dom";
import { getEventContent } from '@/state/eventContent.js';
import { getActiveEvent, getLastEvent } from '@/state/activeEvent.js';

/**
 * 404 page. Rendered in two spots: inside an event's Layout (bad sub-path
 * under /e/<slug>) and standalone at the top level (bad path outside any
 * event). Standalone falls back to the last event this device visited,
 * or the host entrance when there's none.
 */
export default function NotFound({ standalone = false }) {
  const slug = getActiveEvent() || getLastEvent();
  const home = slug ? `/e/${slug}` : "/host";
  const label = slug ? "Back to your event" : "Go to host tools";
  return (
    <section className="page-section nf">
      <h1 className="nf-title">This page slipped away.</h1>
      <p className="nf-body">
        {standalone
          ? "That link doesn't go anywhere. If you're here for an event, use the QR link you were given."
          : `That link doesn't go anywhere on ${getEventContent().initials}'s gallery. Head back to the home screen and pick up from there.`}
      </p>
      <Link to={home} className="btn btn-primary">{label}</Link>
    </section>
  );
}
