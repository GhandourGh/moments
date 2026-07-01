# Auth

Named, per-device. No password, no email, no OAuth. The guest's **name is the
identity** for this event.

## Why this shape

- Weddings are trust-based; adding real auth is friction.
- Every guest needs attribution on the photos they take. Anonymous devices
  won't cut it.
- Face-based identity is coming later — this model is designed to attach to it
  without breaking existing rows.

## Client model

localStorage key: `moment.guest.v1`

```json
{
  "id": "8a1c9c60-1b0c-4c9c-8a1c-9c601b0c4c9c",
  "firstName": "Mira",
  "lastName": "Haddad",
  "updatedAt": "2026-07-01T21:04:00.000Z"
}
```

- `id` is a UUID **minted client-side** on first save. Never regenerated.
- `firstName` / `lastName` are what the guest typed in the welcome modal.
  Trimmed. 1–40 chars each.
- The client is the source of truth for `id`. The server accepts it verbatim.

Read/write goes through [`moment/src/state/guest.js`](../src/state/guest.js) — never touch localStorage directly from features. That module also fires a change event so `/me` edits re-render the UI.

## Server model

- `guests(id, event_id, first_name, last_name, device_id, ...)` — see [data-model.md](./data-model.md).
- `id` is set from the client's UUID.
- `(event_id, device_id)` is unique — one guest row per event per device.
- Server issues a **signed cookie** `moment.sid` after `POST /api/session`.
  Payload: `{ guestId, eventId, iat }`, HS256 signed with a Vercel env secret.
  1-year expiry. `HttpOnly`, `Secure`, `SameSite=Lax`.

## Flows

### First visit

```
guest opens https://moment.app/?event=rawad-maya
   │
   ▼
Layout sees no `moment.guest.v1` in localStorage
   │
   ▼
WelcomeModal renders with First/Last inputs
   │
   ▼
Guest submits ▶ client mints UUID ▶ guest.js.setGuest({ firstName, lastName })
   │
   ▼
POST /api/session  { event: "rawad-maya", guestId, firstName, lastName }
   │
   ▼
Server upserts `guests(id, event_id, first_name, last_name, device_id=guestId)`
Server returns 200 + Set-Cookie: moment.sid=...
   │
   ▼
Modal closes ▶ app is live
```

If the server call fails, the client keeps the guest in localStorage anyway.
The upload queue in [`services/storage/uploadQueue.js`](../src/services/storage/uploadQueue.js) will retry `/api/session` before its next upload attempt — the party can't wait for us to fix a 500.

### Return visit

```
guest reopens the app
   │
   ▼
Layout sees `moment.guest.v1` present
   │
   ▼
Client calls POST /api/session with the stored { id, firstName, lastName }
   │
   ▼
Server: same row exists ▶ refresh Set-Cookie, no-op the update
        different name  ▶ update guests.first_name/last_name (see below)
   │
   ▼
app renders
```

### Name edit from `/me`

```
Guest types a new name ▶ Save
   │
   ▼
guest.js.updateGuest({ firstName, lastName }) ▶ localStorage updated ▶ subscribers re-render
   │
   ▼
PATCH /api/session { firstName, lastName }
   │
   ▼
Server updates `guests` row.
Existing `photos.guest_first_name / guest_last_name` are NOT backfilled.
```

Snapshot-not-backfill is deliberate: it stops after-the-fact rewriting of who
took what, and matches how paper photo albums behave.

## Upgrade path to magic links

Later, we can add `POST /api/auth/link` that emails or SMSes a code:

- Verifying the code marks the current `guests` row as `verified_at`.
- If the same person hits the link on a second device, that device's `guests`
  row is merged into the verified one — `photos.guest_id` and `videos.guest_id`
  are repointed in a single transaction. `device_id` becomes a text array on
  the surviving row.
- Nothing about the current model needs to move to enable this.

## Threat model

- Names are self-declared and unverified. This is a party guestbook, not a
  bank login. Someone can pretend to be someone else. Accept that.
- The signed cookie prevents casual attribution spoofing across devices —
  another guest can't just POST a photo claiming to be Mira Haddad without
  Mira's session.
- Rate limiting on `POST /api/events/:id/photos` (per `guest_id`) prevents
  a single device from spamming the album.
- **We deliberately do not** implement CAPTCHAs, email verification, or
  invite-code checks. This is invitees-only by URL; if the URL leaks, the
  couple can rotate `events.slug` in the database. That's the escape hatch.

## Session lifecycle & invalidation

- Cookie lifetime: 1 year. Party events wrap in a day; a year covers guests
  revisiting the gallery long after.
- Server can invalidate a session by bumping a `session_epoch` on the `guests`
  row and rejecting cookies with `iat < session_epoch`. Used only if a device
  is stolen or a guest is banned by the couple.
- No refresh tokens. If the cookie is stale, the client re-calls `POST /api/session` transparently — the localStorage state is enough to reconstruct it.

## Related files

- [`moment/src/state/guest.js`](../src/state/guest.js) — client state module (to be created).
- [`moment/src/features/welcome/WelcomeModal.jsx`](../src/features/welcome/WelcomeModal.jsx) — name gate.
- [`moment/src/features/me/Me.jsx`](../src/features/me/Me.jsx) — name edit.
- [`moment/src/services/api/index.js`](../src/services/api/index.js) — HTTP client.
- [api-contract.md](./api-contract.md) — endpoint shapes.
