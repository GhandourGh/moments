-- Moments — storage buckets + face-embedding reshape.
--
-- 1. Private buckets for photos/ and videos/. No storage RLS policies on
--    purpose: all reads/writes go through the Vercel functions with the
--    service role, and clients only ever see 24h signed URLs
--    (docs/api-contract.md → GET /api/events/:id/photos).
--
-- 2. face_embeddings becomes one-row-per-FACE (a group photo has many faces)
--    and drops to vector(128): embeddings are computed on-device with the
--    face-api recognition model (128-dim, L2-normalised descriptors) so face
--    match costs $0/event. Table was empty; safe to drop and recreate.
--
-- 3. moment.match_faces() — cosine ANN search used by POST /api/events/:id/match.

-- ----------------------------------------------------------------------------
-- Storage buckets
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 12582912,  array['image/jpeg','image/png','image/webp']),
  ('videos', 'videos', false, 104857600, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- face_embeddings v2 — per-face rows, 128-dim
-- ----------------------------------------------------------------------------
drop table if exists face_embeddings;

create table face_embeddings (
  id         bigserial primary key,
  photo_id   uuid not null references photos(id) on delete cascade,
  embedding  vector(128) not null,
  model      text not null,
  created_at timestamptz not null default now()
);

create index face_embeddings_photo_idx on face_embeddings (photo_id);
create index face_embeddings_ann_idx
  on face_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table face_embeddings enable row level security;

-- Guests can read embeddings only for their own photos (parity with the
-- dropped v1 policy). Inserts stay service-role-only: no insert policy.
create policy face_embeddings_select_own on face_embeddings
  for select using (
    exists (
      select 1 from photos p
      where p.id = face_embeddings.photo_id
        and p.guest_id = moment.current_guest_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Face match search
-- ----------------------------------------------------------------------------
create or replace function moment.match_faces(
  p_event_id  uuid,
  p_embedding vector(128),
  p_threshold float default 0.82,
  p_limit     int   default 50
)
returns table (photo_id uuid, similarity float)
language sql stable as $$
  select fe.photo_id,
         max(1 - (fe.embedding <=> p_embedding))::float as similarity
  from face_embeddings fe
  join photos p on p.id = fe.photo_id
  where p.event_id = p_event_id
    and p.moderation_status <> 'blocked'
  group by fe.photo_id
  having max(1 - (fe.embedding <=> p_embedding)) >= p_threshold
  order by similarity desc
  limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Public wrapper — PostgREST only exposes `public`, so supabase-js rpc()
-- can't reach moment.match_faces directly. Service-role usage only.
-- (Applied live as migration `match_faces_public`.)
-- ----------------------------------------------------------------------------
create or replace function public.match_faces(
  p_event_id  uuid,
  p_embedding vector(128),
  p_threshold float default 0.82,
  p_limit     int   default 50
)
returns table (photo_id uuid, similarity float)
language sql stable as $$
  select * from moment.match_faces(p_event_id, p_embedding, p_threshold, p_limit);
$$;

revoke execute on function public.match_faces(uuid, vector, float, int) from anon, authenticated;

-- The api/ functions hit moment.match_faces via the service role.
grant usage on schema moment to service_role;
grant execute on function moment.match_faces(uuid, vector, float, int) to service_role;

-- Pin search_path (supabase linter 0011) on every function we own.
alter function public.touch_updated_at() set search_path = public;
alter function moment.current_guest_id() set search_path = public;
alter function moment.is_event_owner(uuid) set search_path = public;
alter function moment.match_faces(uuid, vector, float, int) set search_path = public;
alter function public.match_faces(uuid, vector, float, int) set search_path = public, moment;
