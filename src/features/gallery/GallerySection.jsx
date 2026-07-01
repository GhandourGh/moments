import React, { useEffect, useRef, useState } from "react";
import PhotoGrid from '@/features/gallery/PhotoGrid.jsx';

/**
 * One time-bucket of gallery shots. The label uses `.section-eyebrow`
 * typography — repurposed here as a legitimate chronological marker.
 * When `pulseKey` changes (a new shot just landed), the label pulses
 * once for ~1.5s. Pass an absolute `pulseKey` (e.g. the newest takenAt)
 * so React only re-pulses on real arrivals, not re-renders.
 */
export default function GallerySection({ label, shots, onOpen, indexOffset = 0, pulseKey }) {
  const [pulsing, setPulsing] = useState(false);
  const prevKey = useRef(pulseKey);

  useEffect(() => {
    if (pulseKey == null) return;
    if (prevKey.current !== pulseKey && prevKey.current != null) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 1500);
      return () => clearTimeout(t);
    }
    prevKey.current = pulseKey;
  }, [pulseKey]);

  if (!shots.length) return null;
  return (
    <section className="gs">
      {label && (
        <p className={`section-eyebrow gs-label${pulsing ? " gs-label-pulse" : ""}`}>
          {label}
        </p>
      )}
      <PhotoGrid
        shots={shots}
        onOpen={(i) => onOpen?.(indexOffset + i)}
      />
    </section>
  );
}
