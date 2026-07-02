# API contract

Every endpoint the client calls. If it isn't here, the frontend must not call it.

> **2026-07-02 addendum — admin + routing rework.** Guest URLs moved from
> `?event=<slug>` to path routes `/e/<slug>`. New endpoints (all admin ones
> take the `x-admin-passcode` header, no guest session):
>
> - `GET /api/events` — list events with `guests`/`photos`/`videos` counts.
> - `POST /api/events` — create `{ title, slug?, startsAt, endsAt, content? }` (slug derived from title when omitted).
> - `PATCH /api/events/:id` — partial update of `{ title, startsAt, endsAt, content }`.
> - `DELETE /api/events/:id` — hard delete: storage objects then rows → `{ ok, deletedPhotos, deletedVideos }`.
> - `DELETE /api/events/:id/photos/:photoId` — per-photo delete → `{ ok }`.
> - `GET /api/events/:id/photos` (and `/videos`) — also accept `x-admin-passcode` instead of a guest session.
> - `GET /api/manifest?event=<slug|uuid>` — per-event PWA manifest with `start_url: /e/<slug>` (public).
>
> Known deviations that stand: photo body cap is **4 MB** (`payload_too_large`);
> videos use two-step init/confirm with guest-scoped storage keys; match takes a
> JSON embedding; `Idempotency-Key` and edge rate-limit bucketing below are still
> **not implemented** (dedupe is by content hash).

- **Base URL**: `VITE_API_BASE` (see [.env.example](../.env.example)).
- **Auth**: signed cookie `moment.sid` on every non-session endpoint. Set by `POST /api/session`. See [auth.md](./auth.md).
- **Content type**: JSON in, JSON out — except upload endpoints which take `multipart/form-data`.
- **Errors**: `{ error: string, code: string }` with a matching HTTP status. See "Error codes" at the bottom.
- **Idempotency**: any endpoint that mutates state accepts `Idempotency-Key` header. Two calls with the same key + body return the same response and cause exactly one side effect.
- **Rate limits**: per-`guest_id` unless noted. Bucketed at the Vercel edge.

The client that consumes these lives in [`moment/src/services/api/index.js`](../src/services/api/index.js). Existing methods stay named the same:  `uploadShot`, `fetchShotsSince`, `matchSelfie` — extended with new ones below.

## Endpoints

### `POST /api/session`

Create-or-refresh the guest's session. First call in every visit.

Request:
```json
{
  "event": "rawad-maya",
  "guestId": "8a1c9c60-1b0c-4c9c-8a1c-9c601b0c4c9c",
  "firstName": "Mira",
  "lastName": "Haddad"
}
```

Response `200`:
```json
{ "guestId": "8a1c9c60-1b0c-4c9c-8a1c-9c601b0c4c9c", "eventId": "..." }
```
Sets `Set-Cookie: moment.sid=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.

Auth: **none** (this is how you get one).
Rate: 60/min per IP.
Error codes: `invalid_event`, `invalid_name`, `event_ended`.

### `PATCH /api/session`

Edit the current guest's name.

Request:
```json
{ "firstName": "Mira", "lastName": "Haddad-Kanaan" }
```

Response `200`: `{ "ok": true }`.

Auth: session cookie.
Rate: 10/min per guest.
Error codes: `invalid_name`, `unauthenticated`.

### `GET /api/events/:id`

Public event metadata. Used to render the event title on the welcome modal and gallery.

Response `200`:
```json
{
  "id": "...",
  "slug": "rawad-maya",
  "title": "Rawad & Maya",
  "startsAt": "2026-09-05T18:00:00Z",
  "endsAt": "2026-09-06T02:00:00Z",
  "coverPhotoId": "..." | null
}
```

Auth: **none** — public.
Rate: 120/min per IP.
Error codes: `not_found`.

### `POST /api/events/:id/photos`

Upload a photo. Multipart form.

Form fields:
- `file` — the JPEG/PNG blob
- `takenAt` — ISO 8601 timestamp (client clock, informational only)
- `hash` — sha256 of the blob bytes (client-computed; server verifies)

Response `200`:
```json
{
  "accepted": ["<photo_id>"],
  "skipped":  [],
  "total": 42
}
```

- `accepted` = new rows created.
- `skipped` = uploads whose `hash` already exists for this event (dedupe).
- `total` = total photos in the event now.

Auth: session cookie.
Rate: 30 uploads/min per guest.
Error codes: `unauthenticated`, `event_ended`, `file_too_large`, `unsupported_media`, `moderation_blocked`.

### `GET /api/events/:id/photos`

List photos for the gallery.

Query params:
- `since` — optional ISO 8601; server returns only photos with `taken_at >= since`.
- `limit` — default 100, max 500.
- `cursor` — opaque pagination cursor from the previous response.

Response `200`:
```json
{
  "photos": [
    {
      "id": "...",
      "url": "https://...supabase.co/storage/v1/object/sign/...",
      "takenAt": "2026-09-05T20:14:00Z",
      "width": 1600,
      "height": 1067,
      "guest": { "id": "...", "firstName": "Mira", "lastName": "Haddad" }
    }
  ],
  "total": 42,
  "nextCursor": null
}
```

`url` is a Supabase signed URL, valid for 24 h. Client should not cache past that.

Auth: session cookie (event must match).
Rate: 240/min per guest.
Error codes: `unauthenticated`, `not_found`.

### `POST /api/events/:id/videos`

Same as photos, but for video blobs. Same response shape swapping "photos" → "videos".

Extra form fields:
- `durationMs` — client-measured length.

Auth: session cookie.
Rate: 10 uploads/min per guest (videos are heavier; tighter limit).
Error codes: same as photos, plus `duration_too_long` (>60 s).

### `GET /api/events/:id/videos`

Same shape as `GET /api/events/:id/photos`.

### `POST /api/events/:id/match` — behind `env.ai.faceMatchEnabled`

Match a selfie against uploaded photos in this event.

Form fields:
- `selfie` — the selfie JPEG

Response `200`:
```json
{
  "photoIds": ["...", "...", "..."],
  "matched": 3,
  "threshold": 0.72
}
```

`photoIds` are ordered by descending confidence. Client renders them as
"Photos of you".

Auth: session cookie.
Rate: 5/min per guest.
Error codes: `unauthenticated`, `no_face_detected`, `ai_disabled`, `ai_provider_down`.

### `POST /api/ai/caption` — behind AI flag

Generate accessible alt-text for a photo.

Form fields:
- `file` — the photo blob

Response `200`:
```json
{ "caption": "Two people hugging under string lights on a rooftop patio." }
```

Auth: session cookie.
Rate: 20/min per guest.
Error codes: `unauthenticated`, `ai_disabled`, `ai_provider_down`.

### `POST /api/ai/moderate` — behind AI flag

Pre-upload safety check. Called by the client **before** `POST /photos` when
the flag is on.

Form fields:
- `file` — the photo blob

Response `200`:
```json
{ "allowed": true, "reasons": [] }
```
or
```json
{ "allowed": false, "reasons": ["nudity"] }
```

Auth: session cookie.
Rate: 60/min per guest.
Error codes: `unauthenticated`, `ai_disabled`, `ai_provider_down`.

### `GET /api/health`

Deployed as the first endpoint. Used by uptime checks and by CI.

Response `200`:
```json
{ "ok": true, "version": "0.1.0", "commit": "abc1234" }
```

Auth: **none**.

## Error codes

| code                  | HTTP | Meaning                                         |
|-----------------------|------|-------------------------------------------------|
| `unauthenticated`     | 401  | Missing / invalid session cookie.               |
| `invalid_event`       | 400  | Event slug doesn't exist.                       |
| `invalid_name`        | 400  | First/last name failed validation.              |
| `event_ended`         | 403  | Event `ends_at` has passed for capture endpoints.|
| `not_found`           | 404  | Photo/video/event doesn't exist.                |
| `file_too_large`      | 413  | Exceeds server upload cap (per stack.md).       |
| `unsupported_media`   | 415  | Not an allowed mime type.                       |
| `moderation_blocked`  | 422  | AI moderator marked as unsafe.                  |
| `duration_too_long`   | 422  | Video > 60 s.                                   |
| `no_face_detected`    | 422  | Selfie had no detectable face.                  |
| `ai_disabled`         | 503  | Endpoint requires AI, but the flag is off.      |
| `ai_provider_down`    | 502  | Anthropic gateway failed.                       |
| `rate_limited`        | 429  | See `Retry-After` header.                       |

## Versioning

- All endpoints are unversioned in the URL. If we need to break a shape, we
  ship a `v2` sibling and cut over the client in one deploy.
- Additive fields never break existing clients — always safe to add.
- Removing or renaming a field requires a v2 endpoint.

## Client integration

- The existing three methods in [`services/api/index.js`](../src/services/api/index.js) stay named the same but their paths gain `/api/` and their bodies change to match this doc (`file` instead of `files`, add `hash` + `takenAt`).
- New methods to add:  `createSession`, `patchSession`, `getEvent`, `uploadVideo`, `fetchVideosSince`, `moderatePhoto`, `captionPhoto`.
- The AI methods live behind `env.ai.faceMatchEnabled` and equivalent flags in [`config/env.js`](../src/config/env.js).
