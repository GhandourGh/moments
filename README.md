# moments

Wedding guest app — gallery, camera capture, and event pages.

## Development

```bash
npm install
npm run dev
```

Vite prints **Local** and **Network** URLs with **https://** (required for the camera on phones).

## Test on your phone (same Wi‑Fi)

1. Start the dev server: `npm run dev`
2. Connect your phone to the **same Wi‑Fi** as your Mac
3. On your phone, open the **Network** URL — it must start with **`https://`**, not `http://`
4. Your browser will warn about the certificate (self-signed). Continue / trust it:
   - **iPhone (Safari):** tap **Show Details** → **visit this website** → **Visit Website**
   - **Android (Chrome):** **Advanced** → **Proceed**

If the page doesn’t load, allow incoming connections if macOS asks about the firewall, and turn off VPN on either device.

### Camera on a real phone

Browsers block the camera on plain **`http://192.168.x.x`**. The dev server uses **HTTPS** so the camera works over your local IP after you accept the certificate warning.

If the camera still fails (permission denied, etc.), use **Choose from library** in the camera screen to pick a photo instead.

### Alternative: ngrok

If HTTPS on LAN is awkward, use a public HTTPS tunnel:

```bash
npm run dev
ngrok http 5174
```

Open the `https://….ngrok.io` link on your phone.

## Build

```bash
npm run icons    # generate PWA PNG icons (required before first deploy)
npm run build
npm run preview   # https on port 5174, also reachable on LAN
```

The service worker only registers in production builds. To test install behavior locally, run `npm run build && npm run preview` — not `npm run dev`.

### PWA install testing

| Platform | Behavior |
|----------|----------|
| **Android (Chrome)** | `beforeinstallprompt` enables a one-tap **Install** button in the Add to Home Screen card |
| **iPhone (Safari)** | No install API — guests follow manual steps (Share → Add to Home Screen). Chrome on iOS shows an **Open in Safari** flow with copy-link |

Run `npm run icons` before deploying so `manifest.webmanifest` references valid PNG icons (192×192 and 512×512).
