-- Moments — initial schema.
-- Matches docs/data-model.md. Every table has RLS enabled; policies live in
-- the next migration (20260701000002_rls.sql) so this file is safe to run
-- against an empty database without locking anyone out during setup.

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector for face_embeddings

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
create table events (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  cover_photo_id uuid,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- guests
-- ----------------------------------------------------------------------------
create table guests (
  id          uuid primary key,
  event_id    uuid not null references events(id) on delete cascade,
  first_name  text not null check (length(trim(first_name)) between 1 and 40),
  last_name   text not null check (length(trim(last_name))  between 1 and 40),
  device_id   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (event_id, device_id)
);

create index guests_event_idx on guests (event_id);

-- ----------------------------------------------------------------------------
-- photos
-- ----------------------------------------------------------------------------
create table photos (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  guest_id          uuid not null references guests(id) on delete restrict,

  guest_first_name  text not null,
  guest_last_name   text not null,

  storage_key       text not null,
  taken_at          timestamptz not null,
  width             int  not null,
  height            int  not null,
  mime              text not null,
  hash              text not null,
  moderation_status text not null default 'pending'
                    check (moderation_status in ('pending','allowed','blocked')),

  created_at        timestamptz not null default now(),

  unique (event_id, hash)
);

create index photos_event_taken_idx on photos (event_id, taken_at desc);
create index photos_guest_idx       on photos (guest_id);

alter table events
  add constraint events_cover_photo_fk
  foreign key (cover_photo_id) references photos(id) on delete set null;

-- ----------------------------------------------------------------------------
-- videos
-- ----------------------------------------------------------------------------
create table videos (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  guest_id          uuid not null references guests(id) on delete restrict,

  guest_first_name  text not null,
  guest_last_name   text not null,

  storage_key       text not null,
  taken_at          timestamptz not null,
  duration_ms       int  not null,
  width             int  not null,
  height            int  not null,
  mime              text not null,
  hash              text not null,
  moderation_status text not null default 'pending'
                    check (moderation_status in ('pending','allowed','blocked')),

  created_at        timestamptz not null default now(),

  unique (event_id, hash)
);

create index videos_event_taken_idx on videos (event_id, taken_at desc);
create index videos_guest_idx       on videos (guest_id);

-- ----------------------------------------------------------------------------
-- face_embeddings
-- ----------------------------------------------------------------------------
create table face_embeddings (
  photo_id   uuid primary key references photos(id) on delete cascade,
  embedding  vector(512) not null,
  model      text not null,
  created_at timestamptz not null default now()
);

create index face_embeddings_ann_idx
  on face_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ----------------------------------------------------------------------------
-- reactions
-- ----------------------------------------------------------------------------
create table reactions (
  id         bigserial primary key,
  photo_id   uuid not null references photos(id) on delete cascade,
  guest_id   uuid not null references guests(id) on delete cascade,
  kind       text not null check (kind in ('heart','laugh','wow')),
  created_at timestamptz not null default now(),

  unique (photo_id, guest_id, kind)
);

create index reactions_photo_idx on reactions (photo_id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger guests_touch_updated_at
before update on guests
for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS enablement (policies land in the next migration)
-- ----------------------------------------------------------------------------
alter table events           enable row level security;
alter table guests           enable row level security;
alter table photos           enable row level security;
alter table videos           enable row level security;
alter table face_embeddings  enable row level security;
alter table reactions        enable row level security;
