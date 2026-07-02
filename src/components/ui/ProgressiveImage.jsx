import React, { useEffect, useState } from "react";
import PhotoAwaitPlaceholder from '@/components/ui/PhotoAwaitPlaceholder.jsx';

/**
 * Grid/strip image with a branded placeholder until bytes paint.
 * Avoids the old black-tile flash while full-res or thumb URLs download.
 */
export default function ProgressiveImage({
  src,
  thumbSrc,
  variant = "tile",
  eager = false,
  className = "",
  ...props
}) {
  const displaySrc = thumbSrc || src;
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
    if (!displaySrc) return;
    const probe = new Image();
    probe.decoding = "async";
    probe.src = displaySrc;
    if (probe.complete) setLoaded(true);
  }, [displaySrc]);

  if (!displaySrc || broken) {
    return <PhotoAwaitPlaceholder variant={variant} />;
  }

  return (
    <div className={`ph-img-wrap${loaded ? " ph-img-wrap--ready" : ""}`}>
      {!loaded && <PhotoAwaitPlaceholder variant={variant} />}
      <img
        src={displaySrc}
        alt=""
        className={`ph-img${loaded ? " ph-img--ready" : ""} ${className}`.trim()}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setBroken(true)}
        {...props}
      />
    </div>
  );
}
