import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

/**
 * Lightweight toast system. Each toast can optionally carry an action
 * (e.g. an "Undo" button). Use:
 *   show("Saved");
 *   show("Added to the gallery", { action: { label: "Undo", onClick: () => … }, duration: 5000 });
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]); // [{ id, message, action }]
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((message, opts = {}) => {
    const { duration = 2800, action, actions } = opts;
    // Normalize the action API: callers can pass `action` (single) or
    // `actions` (array). Internally we always work with an array.
    const list = actions ?? (action ? [action] : []);
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, actions: list }]);
    const handle = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, handle);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="status">
            <span className="toast-msg">{t.message}</span>
            {t.actions.length > 0 && (
              <div className="toast-actions">
                {t.actions.map((a, i) => (
                  <button
                    key={i}
                    className="toast-action"
                    onClick={() => { a.onClick(); dismiss(t.id); }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
