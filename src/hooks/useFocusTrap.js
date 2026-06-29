import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Trap keyboard focus inside `ref`'s element while `active` is true.
 * - Initial focus goes to the first focusable element (or the container).
 * - Tab / Shift+Tab cycles within the container.
 * - On unmount or when `active` flips false, focus returns to whatever
 *   was focused before the trap opened.
 */
export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement;

    const targets = () => Array.from(node.querySelectorAll(FOCUSABLE));
    const first = targets()[0] || node;
    // Defer to next tick so the element is laid out before focusing.
    const id = requestAnimationFrame(() => first.focus?.());

    function onKey(e) {
      if (e.key !== "Tab") return;
      const list = targets();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
