import React from "react";
import { createRoot } from "react-dom/client";
import App from '@/app/App.jsx';
import { env } from '@/config/env.js';
import '@/styles/index.css';

// Sentry no-ops without a DSN so local dev and previews need no account.
// Lazy import keeps the SDK out of the critical path either way.
if (env.sentryDsn) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({ dsn: env.sentryDsn, environment: env.mode, tracesSampleRate: 0 });
  }).catch(() => {});
}

createRoot(document.getElementById("root")).render(<App />);

// Register the service worker for PWA installability + offline shell.
// Dev runs aren't served from /sw.js, so the registration just no-ops there.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
