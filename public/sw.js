/* MOMENTS guest-ui service worker — minimal cache-first shell.
 *
 * Goals:
 *  - Make the app installable on Android (Chrome requires a registered SW).
 *  - Survive a flaky connection at a venue: the shell still loads, photos
 *    you've already viewed stay cached.
 *
 * Cache name is versioned so bumping the constant invalidates old assets.
 */
// v10: cache stable hero URLs (/api/events/:slug/hero) across refreshes.
const VERSION = "fg-v10";
const SHELL = ["/", "/logo.svg", "/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png"];

function isPhotoAsset(pathname) {
  return /^\/(hero\.jpg|seed\/)/.test(pathname);
}

function isManifest(pathname) {
  return pathname === "/manifest.webmanifest";
}

function isHeroApi(pathname) {
  return /^\/api\/events\/[^/]+\/hero$/.test(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const pathname = new URL(req.url).pathname;

  // Cache-first for the stable hero image — small, public, immutable.
  if (isHeroApi(pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Never cache other API traffic — gallery polls, signed URLs, etc.
  if (pathname.startsWith("/api/")) return;

  // Network-first for HTML so route updates land fast; fall back to cache.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Network-first for manifest so PWA install name updates after rebrand.
  if (isManifest(pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for gallery/hero photos so deploys show new images immediately.
  if (isPhotoAsset(pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for JS/CSS/fonts/icons.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
