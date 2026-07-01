# Moment

Guest-side photo capture + share app. Feature-first React (Vite) codebase, ready
to plug in a database, hosting, and AI/ML surfaces.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values you want to wire up
npm run dev                  # https://<lan-ip>:5174/ — camera needs HTTPS on phones
npm run build
```

## Project layout

```
src/
├── app/              Bootstrap only. main.jsx, App.jsx, router entry.
├── features/         One folder per user-facing feature. Owns its own
│                     components, routes, and hooks. No cross-feature imports.
│   ├── camera/       Live camera, capture, flash, zoom, recording.
│   ├── gallery/      Grid, filters, lightbox, sections.
│   ├── story/        Story route + copy.
│   ├── tonight/      Landing route + captured strip, memory card, night table.
│   ├── me/           Selfie-based "find my photos" flow.
│   ├── welcome/      Welcome modal, Add-to-home, install guide.
│   └── not-found/    404 route.
├── components/
│   ├── layout/       App shell: Navbar, Fab, BottomTabBar, ErrorBoundary…
│   └── ui/           Reusable primitives: Toast, EmptyState, TimeBadge…
├── hooks/            Cross-feature React hooks.
├── services/
│   ├── api/          HTTP client for the photo backend.
│   ├── db/           Database adapter (Supabase / Neon / …). Provider-agnostic.
│   ├── ai/           AI/ML adapter (face match, caption, moderation).
│   ├── storage/      IndexedDB photo store + background upload queue.
│   └── sounds.js     Capture/record audio cues.
├── state/            Global React contexts (photos).
├── config/           env reader, couple config, memory-card template.
├── lib/              Tiny leaf utilities that don't fit elsewhere.
├── data/             Seed data.
└── styles/           Global + per-feature CSS.
```

Imports use the `@/` alias — e.g. `import Layout from "@/components/layout/Layout.jsx"`.
Never reach across features; if two features need the same thing, promote it
into `components/`, `hooks/`, `services/`, or `config/`.

## Wiring the moving parts

### Database (`services/db`)

`services/db/index.js` exposes `getDb()` returning a driver that matches a small
contract (`getEvent`, `listGuests`, `recordCapture`, `listCaptures`). Set
`VITE_DB_PROVIDER` in `.env.local` to pick the driver. Drop new drivers in
`services/db/drivers/` and add the switch arm — nothing else in the app should
know which database is behind it.

The in-app photo pipeline (IndexedDB + upload queue) stays in
`services/storage`; `db` is for durable, cross-device data — events, guests,
albums, comments.

### Hosting

`vercel.json` is committed. `npm run build` outputs to `dist/`. Deploy:

- **Vercel** — `vercel` from repo root, or connect the GitHub repo.
- **Capacitor** — `capacitor.config.example.ts` shows the mobile shell config.
- **Any static host** — serve `dist/` behind HTTPS (camera requires it).

Environment variables live only in `.env.local` (git-ignored) or the host's
env panel. Rotate them there, not in the repo.

### AI / ML (`services/ai`)

`services/ai/index.js` mirrors the db pattern: `getAi()` returns a driver with
`faceMatch`, `captionPhoto`, `moderatePhoto`. The client always talks to a
gateway (`VITE_AI_GATEWAY_URL`) so provider keys never ship in the bundle.

Feature-flag AI surfaces with the helpers in `config/env.js`
(e.g. `env.ai.faceMatchEnabled`). Off by default.

## Development notes

- Camera requires HTTPS on mobile. Dev server auto-generates a LAN cert on
  first run and prints the phone URL.
- HMR runs over `wss://` on the LAN IP.
- Every relative import goes through the `@/` alias — moving a file is a
  find-and-replace in one place.
