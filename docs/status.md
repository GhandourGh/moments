# Project status — 2026-07-02 (late night)

A single-page snapshot of everything that exists in the Moment repo right now:
frontend, backend, database, and AI. Written as a handoff so a fresh contributor
can see what's real vs. what's still a placeholder without opening every file.

**Headline: the full backend shipped and is live.** Session auth, event
metadata, the host/admin flow, photo + video uploads, gallery hydration, and
face match are all deployed to production and smoke-tested end to end.

- Production: https://moments-five-chi.vercel.app (guest link: `/e/<slug>` — path-based, one URL per event)
- Host tools: https://moments-five-chi.vercel.app/host (passcode in Vercel env `ADMIN_PASSCODE`); the bare domain root redirects here
- **Event routing rework (this session):** the old `?event=` query param is gone. Events live at `/e/<slug>`; an `EventBoundary` route binds the API client, session cookie, content, and a per-event PWA manifest (`GET /api/manifest?event=<slug>`, `start_url: /e/<slug>`) to the slug. `VITE_EVENT_ID` is a dev-only fallback now — production must not set it.

For deeper background, follow the pointers into [docs/](./README.md).

---

## Stack (locked)

| Layer               | Pick                                | Status                                                              |
|---------------------|-------------------------------------|----------------------------------------------------------------------|
| Hosting             | Vercel (region `sin1`)              | Live. Frontend + all functions deployed, env vars set.               |
| DB + storage + auth | Supabase project `Moments`          | Live. 3 migrations + follow-ups applied, buckets created.            |
| AI                  | **On-device first**, Claude optional| Face match + moderation run in the browser — **$0/event**. Claude moderation/captions activate automatically when `ANTHROPIC_API_KEY` is set. |
| Errors              | Sentry (frontend + serverless)      | Wired, no-ops until `SENTRY_DSN` / `VITE_SENTRY_DSN` are set.        |

Pins and environments live in [stack.md](./stack.md).

---

## Backend — all live

Functions under [api/](../api/), shared plumbing in [api/_lib/](../api/_lib/)
(http/errors/multipart, service-role Supabase client, jose-signed `moment.sid`
cookie, validation mirroring `guest.js`, Sentry wrapper, Anthropic gateway).

| Endpoint | Status | Notes |
|---|---|---|
| `GET /api/health` | ✅ | deploy sentinel, zero deps |
| `POST /api/session` | ✅ | upserts `guests` from client UUID, sets 1-yr HttpOnly cookie |
| `PATCH /api/session` | ✅ | name edit; snapshot-not-backfill |
| `GET /api/events/:id` | ✅ | accepts uuid **or slug** |
| `POST /api/events` + `GET` | ✅ | host flow, `x-admin-passcode` header (env `ADMIN_PASSCODE`) |
| `POST /api/events/:id/photos` | ✅ | multipart; sha256 dedupe; stores face descriptors; server-side Claude moderation when key present |
| `GET /api/events/:id/photos` | ✅ | since/limit/cursor, 24 h signed URLs, blocked never served |
| `POST/GET /api/events/:id/videos` | ✅ | **deviates from contract**: two-step init/confirm with direct-to-storage signed upload (Vercel ~4.5 MB body cap; a 60 s clip can't fit) |
| `POST /api/events/:id/match` | ✅ | **deviates from contract**: takes JSON `{ embedding: number[128] }` computed on-device — selfie never leaves the phone |
| `POST /api/ai/moderate` | ✅ | optional client preflight; `ai_disabled` without a key |
| `POST /api/ai/caption` | ✅ | default OFF (`AI_CAPTIONS=true` to enable — the $9/event line) |
| `DELETE /api/events/:id` | ✅ new | admin; removes storage objects then rows; returns deleted counts |
| `DELETE /api/events/:id/photos/:photoId` | ✅ new | admin per-photo moderation delete |
| `GET /api/manifest?event=` | ✅ new | per-event PWA manifest (`start_url: /e/<slug>`) |

Hardening this session: one strict uuid-vs-slug resolver everywhere (the loose
regex in `media.ts` is gone); dedupe races return the existing row's id; video
storage keys are guest-scoped (`{event}/{guest}/{id}`) so confirm can't be
hijacked; photo cap is 4 MB (`payload_too_large`) under Vercel's ~4.5 MB body
limit; admin passcode compare is constant-time over sha256 digests; photos and
videos GET accept `x-admin-passcode` as an alternative to a guest session.

Rate limiting is best-effort per warm instance (`_lib/http.ts`); edge bucketing
is still a later concern. Idempotency = hash dedupe on uploads only.

### Supabase (ref `ttjkrtvlgcutrhbzdldj`, Singapore)

Migrations applied to `main`: `init`, `rls`, **`storage_faces`** (new,
[20260702000003](../supabase/migrations/20260702000003_storage_faces.sql)) plus
live follow-ups recorded in that same file:

- Private `photos` / `videos` buckets (12 MB / 100 MB caps, mime allowlists).
  No storage policies on purpose — clients only ever see signed URLs.
- `face_embeddings` reshaped: one row **per face** (group photos),
  `vector(128)` to match the on-device model, ivfflat cosine index.
- `moment.match_faces()` + `public.match_faces()` wrapper (PostgREST only
  exposes `public`), service-role grants, `search_path` pinned everywhere.

### Env (Vercel, production + preview — all set)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
`ADMIN_PASSCODE`, `VITE_API_BASE`, `VITE_EVENT_ID=test-event`,
`VITE_AI_FACE_MATCH=true`. Optional, currently unset: `ANTHROPIC_API_KEY`,
`AI_CAPTIONS`, `SENTRY_DSN`, `VITE_SENTRY_DSN`. Full surface in
[.env.example](../.env.example).

---

## AI — $0/event ship default

Per the product decision (free, high quality), both AI features run on-device:

- **Face match** — [services/faces/](../src/services/faces/index.js):
  face-api (tiny detector + landmarks + recognition, ~7 MB from
  `/public/models`, lazy-loaded) computes 128-dim descriptors at capture time;
  they ride along with the upload. `/me` computes the selfie descriptor the
  same way and the server answers with one pgvector query.
- **Moderation** — [services/moderation/](../src/services/moderation/index.js):
  NSFWJS MobileNetV2-mid graph model (~4.3 MB from `/public/models/nsfw`)
  runs on face-api's bundled TF runtime before a photo enters the upload
  queue; blocked shots never leave the device. Fail-open.
- **Paid tier (dormant)** — set `ANTHROPIC_API_KEY` and server-side Claude
  Haiku moderation switches on inside the upload path (authoritative,
  ~$0.87/event); `AI_CAPTIONS=true` adds captions (~$9/event).

---

## Frontend

Everything from the previous snapshot still stands (guest identity, welcome
gate, camera, gallery, `/me`). New since then:

- [services/api/index.js](../src/services/api/index.js) — rewritten to the
  contract: cookie auth with transparent 401 → re-session → retry, client-side
  compression to fit the Vercel body cap, sha256 hashing, session/event/video/
  AI methods, admin methods.
- Session bootstrap: WelcomeModal submit + Layout mount call `POST /api/session`;
  `/me` name save mirrors via `PATCH` ([Layout.jsx](../src/components/layout/Layout.jsx)).
- Upload queue handles **videos** now (duration measured client-side,
  two-step direct upload) and runs moderation + face extraction per photo.
- [features/host/Host.jsx](../src/features/host/Host.jsx) at `/host` (outside
  Layout, lazy chunk): passcode gate → create event → shareable guest link +
  QR (download/copy) → event list with guest/photo counts.
- Sentry in [app/main.jsx](../src/app/main.jsx), no-op without DSN.
- `photoStore` IndexedDB persistence is still disabled (pre-existing).

---

## Per-event frontend content (added later on 2026-07-02)

Every event now owns its hero/texts/story: `events.content` jsonb
(migration [20260702000004](../supabase/migrations/20260702000004_event_content.sql)),
returned by `GET /api/events/:id`, accepted on create, and editable via
`PATCH /api/events/:id` (admin). The client merges it over the defaults in
[config/couple.js](../src/config/couple.js) through
[state/eventContent.js](../src/state/eventContent.js) (guest.js-style module
store + `useEventContent()`); consumers: hero, schedule, story, navbar,
memory card, welcome modal, install guide, 404, marquee band, keepsake
filenames. `/host` has a full content editor (create + edit). Flow fixes
shipped at the same time: photoStore persistence re-enabled (**uploads were
dead without it**), gallery poll now carries guest attribution, and seed
placeholders no longer render when a backend is configured.

## Host dashboard (reworked this session)

`/host` now has: create with content (the client used to drop the content
field — fixed), per-event photo gallery with two-tap photo delete, delete
event behind a type-the-slug confirm, editable title/dates (slug locked —
it's in the QR), guest/photo/video counts auto-refreshing every 15 s, and
proper loading/error/empty states throughout. Guest links + QR encode
`/e/<slug>`. Upload queue survives blocked IndexedDB via an in-memory
mirror; gallery polling overlaps its cursor by 60 s so slow uploads from
other phones aren't skipped.

## What's next

1. **Real event** — create it from `/host` and share the `/e/<slug>` link/QR.
   No env change or redeploy needed per event.
2. **Sentry DSN** — create the Sentry project, set both DSN env vars.
3. **Video moderation** — videos land as `pending`, nothing screens them yet.
4. **Reactions** — schema + RLS exist; no endpoints or UI.
5. **Edge rate limiting + idempotency keys** — contract items still stubbed.
6. **`services/db` adapter** — still `none`; unused now that the API covers reads.
7. Verify the on-device models on real phones (face-api + NSFWJS were
   smoke-tested via API, not through a physical camera flow yet).
