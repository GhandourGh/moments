import React, { forwardRef, useEffect, useRef, useState } from "react";
import PhotoAwaitPlaceholder from '@/components/ui/PhotoAwaitPlaceholder.jsx';

/**
 * Image with a shimmer skeleton while loading and a soft fade-in once ready.
 * Falls back to the branded PhotoAwaitPlaceholder when src is missing or fails.
 */
const LazyImage = forwardRef(function LazyImage(
  {
    src,
    alt = "",
    className = "",
    imgClassName = "",
    variant = "tile",
    loading = "lazy",
    fetchPriority,
    draggable,
    style,
    imgStyle,
    onLoad,
    onError,
    ...rest
  },
  ref,
) {
  const innerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const branded = variant === "tile" || variant === "strip" || variant === "frame";

  const setRefs = (node) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    setLoaded(false);
    setError(false);
    const img = innerRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);

  const handleLoad = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    setError(true);
    onError?.(e);
  };

  if (branded && (!src || error)) {
    return <PhotoAwaitPlaceholder variant={variant} className={className} />;
  }

  if (!src || error) {
    return (
      <span
        className={`lazy-img lazy-img--${variant} ${className}`.trim()}
        style={style}
        aria-hidden={!alt}
      >
        <span className={`lazy-img-shimmer lazy-img-shimmer--${variant}`} />
      </span>
    );
  }

  const pending = !loaded && !error;

  return (
    <span
      className={`lazy-img lazy-img--${variant} ${className}`.trim()}
      style={style}
    >
      {pending && (
        <span className={`lazy-img-shimmer lazy-img-shimmer--${variant}`} aria-hidden />
      )}
      <img
        ref={setRefs}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        draggable={draggable}
        className={`lazy-img-el${loaded ? " is-loaded" : ""} ${imgClassName}`.trim()}
        style={imgStyle}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    </span>
  );
});

export default LazyImage;

/**
 * Video tile thumbnail — shimmer until the first frame is ready.
 */
export function LazyVideo({ src, className = "", variant = "tile", ...rest }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [src]);

  if (!src) {
    return <PhotoAwaitPlaceholder variant={variant} className={className} />;
  }

  return (
    <span className={`lazy-img lazy-img--${variant} ${className}`.trim()}>
      {!ready && (
        <span className={`lazy-img-shimmer lazy-img-shimmer--${variant}`} aria-hidden />
      )}
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        className={`lazy-img-el${ready ? " is-loaded" : ""}`}
        onLoadedData={() => setReady(true)}
        onError={() => setReady(true)}
        {...rest}
      />
    </span>
  );
}
