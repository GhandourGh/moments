import React, { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  useVelocity,
  useAnimationFrame,
  useReducedMotion,
} from "framer-motion";

function useElementWidth(ref) {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    function updateWidth() {
      if (ref.current) setWidth(ref.current.offsetWidth);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [ref]);

  return width;
}

function wrap(min, max, v) {
  const range = max - min;
  const mod = (((v - min) % range) + range) % range;
  return mod + min;
}

/**
 * Scroll-linked velocity marquee for a single text row.
 */
export default function ScrollVelocity({
  text,
  velocity = 100,
  damping = 50,
  stiffness = 400,
  numCopies = 6,
  velocityMapping = { input: [0, 1000], output: [0, 5] },
}) {
  const reduceMotion = useReducedMotion();
  const effectiveVelocity = reduceMotion ? 0 : velocity;

  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping, stiffness });
  const velocityFactor = useTransform(
    smoothVelocity,
    velocityMapping.input,
    velocityMapping.output,
    { clamp: false },
  );

  const copyRef = useRef(null);
  const copyWidth = useElementWidth(copyRef);
  const directionFactor = useRef(1);

  const x = useTransform(baseX, (v) => {
    if (copyWidth === 0) return "0px";
    return `${wrap(-copyWidth, 0, v)}px`;
  });

  useAnimationFrame((_, delta) => {
    let moveBy = directionFactor.current * effectiveVelocity * (delta / 1000);

    if (velocityFactor.get() < 0) directionFactor.current = -1;
    else if (velocityFactor.get() > 0) directionFactor.current = 1;

    moveBy += directionFactor.current * moveBy * velocityFactor.get();
    baseX.set(baseX.get() + moveBy);
  });

  const spans = [];
  for (let i = 0; i < numCopies; i++) {
    spans.push(
      <span className="sv-copy sv-text" key={i} ref={i === 0 ? copyRef : null}>
        {text}&nbsp;
      </span>,
    );
  }

  return (
    <section className="sv-band" aria-hidden>
      <div className="sv-parallax">
        <motion.div className="sv-scroller" style={{ x }}>
          {spans}
        </motion.div>
      </div>
    </section>
  );
}
