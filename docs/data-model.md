# Data model

Postgres schema for the Supabase project. Written as the SQL you'd actually
`\i` — copy-paste into a migration when you're ready.

## Overview

```
events ─── 1:N ─── guests ─── 1:N ─── photos
                     │                   │
                     │                   └── 1:1 ─── face_embeddings
                     │                   └── 1:N ─── reactions
                     └── 1:N ─── videos
```

- One `event` per wedding / night. Guests join via the shareable link (`?event=<slug>`).
- One `guest` row per device-per-event. `device_id` is a client-generated UUID.
- Every `photo`/`video` belongs to exactly one `guest`; guest first + last name are
  snapshotted onto the row so past attribution is stable across name edits.
- `face_embeddings` is only populated when AI is on. Kept in a separate table so
  the photo write path stays cheap.

## Tables

### `events`

```sql
create table events (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,        -- what appears in ?event=<slug>
  title         text not null,               -- "Rawad & Maya"
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  cover_photo_id uuid,                       -- FK added after photos exists
  created_by    uuid,                        -- optional: couple's supabase user
  created_at    timestamptz not null default now()
);
```

### `guests`

One row per (event, device). First + last name are required, editable from `/me`.

```sql
create table guests (
  id            uuid primary key,            -- minted client-side
  event_id      uuid not null references events(id) on delete cascade,
  first_name    text not null check (length(trim(first_name)) between 1 and 40),
  last_name     text not null check (length(trim(last_name))  between 1 and 40),
  device_id     text not null,               -- same value as id today; kept separate
                                             -- for a future magic-link merge
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (event_id, device_id)
);
```

### `photos`

```sql
create table photos (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  guest_id           uuid not null references guests(id) on delete restrict,

  -- Denormalized attribution. Snapshotted at insert; not backfilled on rename.
  guest_first_name   text not null,
  guest_last_name    text not null,

  storage_key        text not null,          -- path inside supabase storage bucket
  taken_at           timestamptz not null,
  width              int  not null,
  height             int  not null,
  mime               text not null,          -- 'image/jpeg' etc.
  hash               text not null,          -- sha256 of the blob for dedupe
  moderation_status  text not null default 'pending'
                     check (moderation_status in ('pending','allowed','blocked')),

  created_at         timestamptz not null default now(),

  unique (event_id, hash)                    -- same guest re-uploading is a no-op
);

create index photos_event_taken_idx on photos (event_id, taken_at desc);
create index photos_guest_idx       on photos (guest_id);
```

### `videos`

Mirrors `photos` plus duration. Kept in a separate table because the read paths
(codec, poster, seek scrubbing) diverge.

```sql
create table videos (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  guest_id           uuid not null references guests(id) on delete restrict,

  guest_first_name   text not null,
  guest_last_name    text not null,

  storage_key        text not null,
  taken_at           timestamptz not null,
  duration_ms        int  not null,
  width              int  not null,
  height             int  not null,
  mime               text not null,          -- 'video/mp4' or 'video/webm'
  hash               text not null,
  moderation_status  text not null default 'pending'
                     check (moderation_status in ('pending','allowed','blocked')),

  created_at         timestamptz not null default now(),

  unique (event_id, hash)
);

create index videos_event_taken_idx on videos (event_id, taken_at desc);
```

### `face_embeddings`

Populated by the AI worker after upload. `pgvector` is available in Supabase.

```sql
create extension if not exists vector;

create table face_embeddings (
  photo_id    uuid primary key references photos(id) on delete cascade,
  embedding   vector(512) not null,
  model       text not null,                 -- e.g. 'anthropic-face-v1'
  created_at  timestamptz not null default now()
);

create index face_embeddings_ann_idx
  on face_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

### `reactions`

Later, but write the shape now so nothing forces a rewrite.

```sql
create table reactions (
  id         bigserial primary key,
  photo_id   uuid not null references photos(id) on delete cascade,
  guest_id   uuid not null references guests(id) on delete cascade,
  kind       text not null check (kind in ('heart','laugh','wow')),
  created_at timestamptz not null default now(),

  unique (photo_id, guest_id, kind)          -- one reaction per kind per guest
);

create index reactions_photo_idx on reactions (photo_id);
```

## Row-Level Security

Every table has RLS enabled. Rules described in prose here — commit the SQL
alongside the migration.

- `events` — anyone with the event slug can `select` (public read via the API).
- `guests` — a guest can `select` and `update` their own row (`id = current_setting('moment.guest_id')::uuid`). Insert goes through the server (`/api/session`), never straight from the client.
- `photos` / `videos` — a guest can `insert` rows where `guest_id = <their id>` and `event_id` matches their session's event; anyone in the event can `select` rows where `moderation_status <> 'blocked'`; a guest can `delete` their own row; the couple (via `events.created_by`) can `delete` any row in their event.
- `face_embeddings` — server-only write; guest can `select` embeddings that belong to their own photos (used by the match endpoint).
- `reactions` — guest can `insert` and `delete` their own row; everyone in the event can `select`.

## Storage buckets

- `photos/` — public-read behind Supabase's signed URLs. Key pattern: `photos/{event_id}/{yyyy}/{mm}/{photo_id}.jpg`.
- `videos/` — same layout, `.mp4`/`.webm`.
- `avatars/` — reserved for a later profile picture per guest; not used in v1.

## Migrations

Live in `supabase/migrations/` (added when we do the first backend commit).
One-way, timestamped, checked into git. No down migrations — if a change is
wrong, write a forward migration that reverses it. Party data is not the place
to test reversibility.
