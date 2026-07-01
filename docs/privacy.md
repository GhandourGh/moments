# Privacy

Guest-facing rules for what happens to photos, videos, and names in Moment.
Half a page on purpose — if it's longer, no one reads it.

## What we collect

- **Name** — first + last, self-declared, from the welcome modal.
- **Photos and videos** the guest chooses to share to the album.
- **A device identifier** — a UUID minted on the device. Not linked to a phone
  number, email, or advertising ID.

We do **not** collect: contacts, location, IP-based geodata beyond what the
hosting provider logs for standard security, or anything from other apps on
the device.

## Who sees what

- **The couple and every guest in the event** can see every photo and video
  in the album, along with the name of the guest who shared each one.
- **Nobody outside the event link** can see anything. The URL is the whole
  gate.
- **We (the app maintainers)** can see rows in the database and objects in
  storage for support and abuse response. Access is logged.

## Attribution

- Every photo and video is tagged with the name that was set on the guest's
  device at the moment of capture.
- Editing the name later from `/me` does **not** rewrite past attributions.
  This matches how paper photo albums work and prevents after-the-fact
  identity swapping.

## Retention

- **During the event and 30 days after**: everything stays. Guests browse the
  gallery, share memories, download what they want.
- **Between 30 and 90 days after**: album goes read-only. No new uploads.
- **After 90 days**: all photos, videos, and derived data (face embeddings,
  captions, moderation records) are deleted from storage and the database.
  The couple can request an archive export before the delete date.

Legal-hold or law-enforcement requests, if any, override this schedule.

## Delete rights

- **Each guest can delete their own photos and videos** at any time from the
  gallery — the row and the storage object are both removed within 24 h.
- **The couple can delete any photo or video** in their event.
- **Requesting a full account delete**: email the address on the couple's
  event page. We delete every row and object linked to the guest's `id`
  within 30 days, including derived data. Snapshotted names on other guests'
  photos are unaffected (those aren't your data).

## AI / face-match

- Face-match ("find photos of me") is **opt-in** and **off by default**.
- When enabled, a face embedding is computed from the guest's selfie and
  compared against embeddings computed for uploaded photos. Embeddings are
  vectors, not images; they cannot be used to reconstruct a face.
- Embeddings are deleted when the underlying photo is deleted, and always
  during the 90-day retention sweep.
- If the AI provider changes, we regenerate embeddings under the new model
  and delete the old ones. We do not send raw photos to the AI provider for
  any purpose other than embedding, captioning, or moderation as described
  in [api-contract.md](./api-contract.md).

## Moderation

- Photos may be checked by an AI moderator before publishing (see
  `POST /api/ai/moderate`). Blocked photos are not shown in the gallery and
  are deleted from storage within 24 h. The uploader sees an inline message
  and can choose a different photo.

## Third parties

- **Vercel** — hosts the app and functions. Data in transit only.
- **Supabase** — stores the database and photos.
- **Anthropic** — invoked from our server for embeddings, captions, and
  moderation when the AI flag is on. Blobs are not retained on their side
  under the standard API terms.
- **Sentry** — error reports only, no photo bodies.

## Names copy shown in the app

Welcome modal, above the CTA:

> Your name will appear on the photos and videos you share tonight. You can
> update it later from your profile.

Me screen, above the name edit:

> Editing your name updates future uploads. Photos you've already shared keep
> the name they were shared with.

## Governance

- This file is source of truth. If the app behaves differently, the app is
  wrong, not the doc.
- Material changes to this file bump a `privacy_revision` in the events
  table and require a re-consent banner on the next visit.
