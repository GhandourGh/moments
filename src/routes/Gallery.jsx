import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePhotos } from "../state/PhotosContext.jsx";
import PhotoGrid from "../components/PhotoGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import BackLink from "../components/BackLink.jsx";
import GalleryFilters from "../components/GalleryFilters.jsx";

const FILTER_KEY = "fg.galleryFilter";
const HOUR_MS = 60 * 60 * 1000;

function filterShots(shots, filter) {
  if (filter === "yours") return shots.filter((s) => !s.seed);
  if (filter === "hour")  return shots.filter((s) => s.takenAt > Date.now() - HOUR_MS);
  return shots;
}

function emptyCopy(filter) {
  if (filter === "yours") return "You haven't captured anything yet. Tap the camera to add the first one.";
  if (filter === "hour")  return "Nothing in the last hour. Try the All filter, or capture something new.";
  return "The gallery is quiet for now. Tap the camera to add the first photo.";
}

export default function Gallery() {
  const { shots } = usePhotos();
  const [openIndex, setOpenIndex] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Persist filter per session so navigating away and back keeps the view.
  const [filter, setFilter] = useState(() => {
    try { return sessionStorage.getItem(FILTER_KEY) || "all"; } catch { return "all"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(FILTER_KEY, filter); } catch { /* no-op */ }
  }, [filter]);

  const visible = useMemo(() => filterShots(shots, filter), [shots, filter]);

  // ?open=<id> — open the lightbox at the matching shot, then strip the
  // param so the URL settles to /gallery and back-button behavior stays clean.
  useEffect(() => {
    const wantedId = searchParams.get("open");
    if (!wantedId) return;
    const idx = visible.findIndex((s) => s.id === wantedId);
    if (idx >= 0) {
      setOpenIndex(idx);
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    } else if (shots.some((s) => s.id === wantedId)) {
      // The shot exists but the current filter is hiding it — reveal it.
      setFilter("all");
    }
  }, [searchParams, visible, shots, setSearchParams]);

  return (
    <section className="page-section">
      <BackLink />
      <header className="section-head">
        <p className="section-eyebrow">The shared gallery</p>
        <h1 className="section-title">Every moment, in one place</h1>
        <p className="section-lede">
          Photos guests take through the night land here automatically.
          Tap any frame to view it full-size.
        </p>
      </header>

      <GalleryFilters value={filter} onChange={setFilter} />

      {visible.length === 0 ? (
        <div className="placeholder">
          <p>{emptyCopy(filter)}</p>
        </div>
      ) : (
        <PhotoGrid shots={visible} onOpen={setOpenIndex} />
      )}

      {openIndex != null && visible.length > 0 && (
        <Lightbox
          shots={visible}
          index={Math.min(openIndex, visible.length - 1)}
          onClose={() => setOpenIndex(null)}
          onIndexChange={setOpenIndex}
        />
      )}
    </section>
  );
}
