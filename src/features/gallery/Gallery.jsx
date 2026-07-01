import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { usePhotos } from '@/state/PhotosContext.jsx';
import GallerySection from '@/features/gallery/GallerySection.jsx';
import Lightbox from '@/features/gallery/Lightbox.jsx';
import BackLink from '@/components/layout/BackLink.jsx';
import GalleryFilters from '@/features/gallery/GalleryFilters.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const FILTER_KEY = "fg.galleryFilter";
const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

function isVideo(s) { return s.mediaType === "video"; }

function filterShots(shots, filter) {
  if (filter === "photos") return shots.filter((s) => !isVideo(s));
  if (filter === "videos") return shots.filter(isVideo);
  return shots;
}

/**
 * Split the visible list into sections. Videos always live in their own
 * "Videos" section, separate from the chronological photo flow, so the
 * grid rhythm of stills isn't broken up by autoplaying thumbnails. Photos
 * still bucket by recency (Just now / This hour / Earlier tonight / From before).
 * Buckets share one `now` snapshot so boundaries are stable per render.
 */
function bucketShots(shots, filter) {
  const photos = shots.filter((s) => !isVideo(s));
  const videos = shots.filter(isVideo);

  const now = Date.now();
  const justNow = [];
  const thisHour = [];
  const earlier = [];
  const before = [];
  for (const s of photos) {
    if (s.seed) { before.push(s); continue; }
    const age = now - s.takenAt;
    if (age < 10 * MIN_MS) justNow.push(s);
    else if (age < HOUR_MS) thisHour.push(s);
    else earlier.push(s);
  }

  const buckets = [];
  if (filter !== "photos" && videos.length) {
    buckets.push({ key: "videos", label: "Videos", shots: videos });
  }
  if (filter !== "videos") {
    buckets.push({ key: "just-now", label: "Just now", shots: justNow });
    buckets.push({ key: "this-hour", label: "This hour", shots: thisHour });
    buckets.push({ key: "earlier", label: "Earlier tonight", shots: earlier });
    // "From before" (seed gallery) only on the unfiltered All view.
    if (filter === "all") buckets.push({ key: "before", label: "From before", shots: before });
  }

  const nonEmpty = buckets.filter((b) => b.shots.length);
  // Drop the single-section label so the page doesn't feel hierarchical
  // when there's nothing to organize.
  if (nonEmpty.length === 1) return nonEmpty.map((b) => ({ ...b, label: null }));
  return nonEmpty;
}

function bucketRender(buckets, pulseKeys, onOpen) {
  let offset = 0;
  return buckets.map((b) => {
    const node = (
      <GallerySection
        key={b.key}
        label={b.label}
        shots={b.shots}
        indexOffset={offset}
        pulseKey={pulseKeys[b.key]}
        onOpen={onOpen}
      />
    );
    offset += b.shots.length;
    return node;
  });
}

function emptyForFilter(filter, openCamera) {
  if (filter === "photos") return {
    illustration: "frame",
    headline: "No photos yet.",
    subhead: "Tap the camera and your first photo lands in the gallery.",
    cta: { label: "Take a photo", onClick: openCamera },
  };
  if (filter === "videos") return {
    illustration: "frame",
    headline: "No videos yet.",
    subhead: "Switch the camera to Video and record a short moment.",
    cta: { label: "Open camera", onClick: openCamera },
  };
  return {
    illustration: "frame",
    headline: "The gallery is quiet for now.",
    subhead: "Be the first to capture the night.",
    cta: { label: "Take a photo", onClick: openCamera },
  };
}

function GallerySkeleton() {
  // 9 neutral tiles in the same grid so layout doesn't jump when hydration
  // completes. No animation under prefers-reduced-motion (CSS handles it).
  return (
    <div className="ph-grid gs-skel" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <div className="ph-tile gs-skel-tile" key={i} />
      ))}
    </div>
  );
}

export default function Gallery() {
  const { shots, hydrated } = usePhotos();
  const { openCamera } = useOutletContext();
  const [openIndex, setOpenIndex] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Persist filter per session so navigating away and back keeps the view.
  const [filter, setFilter] = useState(() => {
    try {
      const saved = sessionStorage.getItem(FILTER_KEY);
      // Migration: prior versions stored "yours" / "hour" — collapse those
      // to "all" since the filter set has been redesigned.
      return ["all", "photos", "videos"].includes(saved) ? saved : "all";
    } catch { return "all"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(FILTER_KEY, filter); } catch { /* no-op */ }
  }, [filter]);

  const visible = useMemo(() => filterShots(shots, filter), [shots, filter]);
  const buckets = useMemo(() => bucketShots(visible, filter), [visible, filter]);

  // Per-bucket pulse key — newest takenAt in that bucket. When a new
  // shot lands and bumps the newest takenAt, GallerySection notices
  // and runs the one-shot pulse animation on the label.
  const pulseKeys = useMemo(() => {
    const map = {};
    for (const b of buckets) {
      map[b.key] = b.shots.length ? Math.max(...b.shots.map((s) => s.takenAt)) : 0;
    }
    return map;
  }, [buckets]);

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
        <h1 className="section-title">The shared gallery</h1>
        <p className="section-lede">
          Every moment guests capture lands here through the night.
          Tap any frame to view it full-size.
        </p>
      </header>

      <GalleryFilters value={filter} onChange={setFilter} />

      {!hydrated ? (
        <GallerySkeleton />
      ) : visible.length === 0 ? (
        <EmptyState {...emptyForFilter(filter, openCamera)} />
      ) : (
        bucketRender(buckets, pulseKeys, setOpenIndex)
      )}

      {openIndex != null && visible.length > 0 && (
        // Lightbox indexes against the same `visible` order — bucketRender
        // passes through indexOffset so per-bucket clicks map back.
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
