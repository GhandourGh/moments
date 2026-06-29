import React, { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Lightbox from "./Lightbox.jsx";

const STACK_MAX = 3;
const UNDO_MS = 5000;
const FLY_SIZE = 112;
const CARD_W = 44;
const CARD_H = 52;
const CARD_SCALE = CARD_W / FLY_SIZE;

const dropSpring = { type: "spring", duration: 0.52, bounce: 0.14 };
const springSoft = { type: "spring", duration: 0.38, bounce: 0.12 };
const easeOut = [0.23, 1, 0.32, 1];

function stackOffset(i) {
  return {
    transform: `translate3d(${i * -4}px, ${i * -3}px, 0) rotate(${i * -5}deg)`,
  };
}

function defaultStackAnchor() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const stackW = 48;
  const stackH = 56;
  return {
    ex: vw - 28 - stackW + (stackW - CARD_W) / 2,
    ey: vh - 52 - stackH - 52 + (stackH - CARD_H) / 2,
  };
}

/**
 * Measured transform fly — one element glides center → stack, then hands off
 * to the stack card on the same frame (no layoutId swap / freeze).
 */
export default function CamSessionStack({ items, lastAddedId, onUndo, hidden }) {
  const stack = items.slice(0, STACK_MAX);
  const stackRef = useRef(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [drop, setDrop] = useState(null);
  const [landingId, setLandingId] = useState(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!lastAddedId || hidden) return;
    if (!items.some((s) => s.id === lastAddedId)) return;

    setUndoVisible(true);
    const undoTimer = setTimeout(() => setUndoVisible(false), UNDO_MS);

    const shot = items.find((s) => s.id === lastAddedId);
    if (!shot || reduceMotion) {
      setDrop(null);
      setLandingId(null);
      return () => clearTimeout(undoTimer);
    }

    setLandingId(lastAddedId);

    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sx = vw / 2 - FLY_SIZE / 2;
      const sy = vh * 0.42 - FLY_SIZE / 2;

      const anchor = stackRef.current?.getBoundingClientRect();
      const fallback = defaultStackAnchor();
      const ex = anchor ? anchor.left + (anchor.width - CARD_W) / 2 : fallback.ex;
      const ey = anchor ? anchor.top + (anchor.height - CARD_H) / 2 : fallback.ey;

      setDrop({ id: shot.id, url: shot.url, sx, sy, ex, ey, key: `${shot.id}-${Date.now()}` });
    };

    requestAnimationFrame(() => requestAnimationFrame(measure));

    return () => clearTimeout(undoTimer);
  }, [lastAddedId, items, hidden, reduceMotion]);

  function handleUndo(e) {
    e.stopPropagation();
    if (lastAddedId) onUndo?.(lastAddedId);
    setUndoVisible(false);
    setDrop(null);
    setLandingId(null);
  }

  function finishDrop() {
    setDrop(null);
    setLandingId(null);
  }

  const visible = !hidden && items.length > 0;
  const handoffId = drop?.id ?? landingId;
  const showUndo = undoVisible && lastAddedId && !drop;

  return (
    <>
      <AnimatePresence>
        {drop && (
          <motion.div
            key={drop.key}
            className="cam-fly-drop"
            style={{ width: FLY_SIZE, height: FLY_SIZE }}
            initial={{
              transform: `translate3d(${drop.sx}px, ${drop.sy}px, 0) scale(0.96) rotate(0deg)`,
              opacity: 0.92,
            }}
            animate={{
              transform: `translate3d(${drop.ex}px, ${drop.ey}px, 0) scale(${CARD_SCALE}) rotate(-5deg)`,
              opacity: 1,
            }}
            exit={{ opacity: 0 }}
            transition={dropSpring}
            onAnimationComplete={finishDrop}
          >
            <img src={drop.url} alt="" draggable={false} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {visible && (
          <motion.div
            className="cam-stack-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.18, ease: easeOut }}
          >
            <AnimatePresence>
              {showUndo && (
                <motion.button
                  type="button"
                  className="cam-stack-undo"
                  onClick={handleUndo}
                  initial={{ opacity: 0, transform: "translate3d(0, 6px, 0)" }}
                  animate={{ opacity: 1, transform: "translate3d(0, 0, 0)" }}
                  exit={{ opacity: 0, transform: "translate3d(0, 4px, 0)" }}
                  transition={springSoft}
                >
                  Undo
                </motion.button>
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              className="cam-stack"
              ref={stackRef}
              onClick={() => setLightboxIndex(0)}
              aria-label={`View ${items.length} photo${items.length === 1 ? "" : "s"} from this session`}
              whileTap={{ transform: "scale(0.94)" }}
            >
              {stack.map((s, i) => {
                if (handoffId && s.id === handoffId) return null;
                return (
                  <motion.span
                    key={s.id}
                    className="cam-stack-card"
                    style={{ "--i": i, zIndex: 10 - i }}
                    initial={false}
                    animate={stackOffset(i)}
                    transition={springSoft}
                  >
                    <img src={s.url} alt="" draggable={false} />
                  </motion.span>
                );
              })}

              {items.length > 0 && (
                <span className="cam-stack-badge" aria-hidden>
                  {items.length > 99 ? "99+" : items.length}
                </span>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {lightboxIndex != null && items.length > 0 && (
        <Lightbox
          shots={items}
          index={Math.min(lightboxIndex, items.length - 1)}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
