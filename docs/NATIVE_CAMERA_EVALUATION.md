# Native Camera Evaluation — Capacitor Shell for A2HS Guests

## Context

MOMENTS's guest camera is a **browser PWA** (`getUserMedia` + canvas JPEG) in
[`src/components/CameraView.jsx`](../src/components/CameraView.jsx). Installed
guests (Add to Home Screen) still run inside **Safari WebKit / Chrome WebView**
with the same APIs — not AVFoundation or CameraX directly.

True sensor-direct capture (12MP+, HDR, multi-lens) requires a **native shell**.

## A2HS vs Capacitor

| Distribution | Runtime | Native camera? |
|--------------|---------|----------------|
| Mobile browser tab | Browser | No — web APIs only |
| A2HS (standalone PWA) | Same browser engine, `display-mode: standalone` | No — still web APIs |
| Capacitor IPA / AAB | WKWebView / Android WebView + native plugins | **Yes** — via plugin bridge |
| Android TWA | Chrome Custom Tabs + optional trusted camera | Partial — store listing required |

**Key finding:** A2HS alone does **not** unlock native camera access. Guests who
install from the home screen need either:

1. **Capacitor app** in App Store / Play Store (recommended hybrid path), or
2. **Android TWA** wrapping the same origin (Play only), or
3. Stay on optimized web camera (current path)

Detection helpers live in [`src/camera/detectNativeShell.js`](../src/camera/detectNativeShell.js).

## Recommended Capacitor Stack

### Phase 1 — Shell (1 week)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "MOMENTS" com.moments.guest --web-dir dist
```

- Point `webDir` at Vite `dist/` output.
- Reuse existing PWA UI; no React Native rewrite.
- Gate native features with `Capacitor.isNativePlatform()`.

### Phase 2 — Still capture (3–5 days)

| Plugin | Use case | Tradeoff |
|--------|----------|----------|
| `@capacitor/camera` | `Camera.getPhoto()` one-shot | No live preview UI; good for Me/selfie route |
| `@capacitor-community/camera-preview` | Live preview in WebView layer | Closer to CameraView; more integration work |
| Custom CameraX / AVFoundation plugin | Full parity (zoom, torch, burst) | 2–3 weeks; best quality |

For **Tonight / burst capture**, `@capacitor/camera` alone is insufficient —
guests need **camera-preview** or a custom plugin matching
[`CameraView`](../src/components/CameraView.jsx) UX.

### Phase 3 — Adapter wiring (2–3 days)

Adapter stubs are in [`src/camera/adapters/`](../src/camera/adapters/):

- `WebCameraAdapter.js` — current implementation
- `NativeCameraAdapter.js` — Capacitor bridge (placeholder)
- `createCameraAdapter.js` — runtime selection

`CameraView` should consume `createCameraAdapter()` and delegate
`takePhoto` / stream lifecycle when `id === "native"`.

## Quality Comparison (estimated)

| Metric | Web PWA (today) | Capacitor + native |
|--------|-----------------|-------------------|
| Shutter latency | 80–200 ms | 30–80 ms |
| Still resolution | ~1080p preview grab | Sensor native |
| Multi-lens (0.5×) | No | Yes (device-dependent) |
| HDR / Night mode | No | Yes (OEM-dependent) |
| Distribution | URL + A2HS | Store + optional A2HS fallback |

## Rollout Strategy

1. **Ship web optimizations first** (canvas pool, ImageCapture API) — covers all guests.
2. **Publish Capacitor build** as optional “MOMENTS Camera” app for venues that want max quality.
3. **Deep link** from A2HS install guide: “For best photos, get the app” on iOS where TWA is unavailable.
4. **Feature flag** `VITE_NATIVE_CAMERA=1` only in Capacitor builds.

## Risks

| Risk | Mitigation |
|------|------------|
| Two code paths (web + native) | Adapter interface; shared review/upload pipeline |
| App Store review for camera | Declare `NSCameraUsageDescription`; match privacy copy |
| Plugin maintenance | Prefer community camera-preview; fork if needed |
| Guests without store app | Web camera remains default; no regression |

## Decision

**Proceed with Capacitor as a medium-term hybrid** — not a replacement for the
web PWA. Adapter scaffolding is in place; full native integration is a
**2–3 week** effort after shell bootstrap.

**Do not** pursue full React Native rewrite unless native becomes the primary
distribution channel.

## Next Steps

1. `npx cap add ios && npx cap add android` in `guest-ui/`
2. Spike `@capacitor-community/camera-preview` behind `NativeCameraAdapter.takePhoto`
3. Wire `createCameraAdapter()` into `CameraView` capture path
4. QA on iPhone 15 + Pixel 8 against web baseline (latency, resolution, EXIF)
