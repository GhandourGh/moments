-- Moments — Row-Level Security policies.
-- Depends on 20260701000001_init.sql (tables + RLS enabled, no policies yet).
--
-- Identity model (see docs/auth.md):
--   The API layer authenticates a request from the signed `moment.sid` cookie
--   and, for every DB call it makes on behalf of the guest, sets a runtime
--   parameter carrying the guest id. Policies read that parameter through the
--   `moment.current_guest_id()` helper below.
--
--   The helper prefers a JWT claim (`request.jwt.claims -> 'guest_id'`) when
--   one is present — that's the shape PostgREST already exposes and the shape
--   a future magic-link upgrade would use. It falls back to a plain GUC
--   (`moment.guest_id`) so the API can `SET LOCAL moment.guest_id = '...'`
--   from a service-role connection without minting a JWT.
--
--   `true` on current_setting = "return NULL if unset" — an anonymous request
--   gets a NULL guest id, which every policy below treats as "no access".

-- ----------------------------------------------------------------------------
-- Auth helpers (schema `moment`)
-- ----------------------------------------------------------------------------
create schema if not exists moment;

create or replace function moment.current_guest_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'guest_id',
    nullif(current_setting('moment.guest_id',       true), '')
  )::uuid
$$;

-- Convenience: is the current guest the couple (creator) of a given event?
create or replace function moment.is_event_owner(p_event_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from events e
     where e.id = p_event_id
       and e.created_by is not null
       and e.created_by = moment.current_guest_id()
  )
$$;

grant usage on schema moment to anon, authenticated;
grant execute on function moment.current_guest_id() to anon, authenticated;
grant execute on function moment.is_event_owner(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- events — anyone with the link can select. Writes are server-only.
-- ----------------------------------------------------------------------------
create policy events_select_all
  on events for select
  using (true);

-- ----------------------------------------------------------------------------
-- guests — a guest can select and update their own row.
-- Insert is server-only (POST /api/session uses the service role).
-- ----------------------------------------------------------------------------
create policy guests_select_own
  on guests for select
  using (id = moment.current_guest_id());

create policy guests_update_own
  on guests for update
  using      (id = moment.current_guest_id())
  with check (id = moment.current_guest_id());

-- ----------------------------------------------------------------------------
-- photos
--   insert: only as yourself, and only into an event you belong to
--   select: anyone in the event whose row isn't blocked
--   delete: your own row, OR any row if you're the event's couple
-- ----------------------------------------------------------------------------
create policy photos_insert_own
  on photos for insert
  with check (
    guest_id = moment.current_guest_id()
    and exists (
      select 1 from guests g
       where g.id = moment.current_guest_id()
         and g.event_id = photos.event_id
    )
  );

create policy photos_select_visible
  on photos for select
  using (
    moderation_status <> 'blocked'
    and exists (
      select 1 from guests g
       where g.id = moment.current_guest_id()
         and g.event_id = photos.event_id
    )
  );

create policy photos_delete_own_or_owner
  on photos for delete
  using (
    guest_id = moment.current_guest_id()
    or moment.is_event_owner(event_id)
  );

-- ----------------------------------------------------------------------------
-- videos — same shape as photos.
-- ----------------------------------------------------------------------------
create policy videos_insert_own
  on videos for insert
  with check (
    guest_id = moment.current_guest_id()
    and exists (
      select 1 from guests g
       where g.id = moment.current_guest_id()
         and g.event_id = videos.event_id
    )
  );

create policy videos_select_visible
  on videos for select
  using (
    moderation_status <> 'blocked'
    and exists (
      select 1 from guests g
       where g.id = moment.current_guest_id()
         and g.event_id = videos.event_id
    )
  );

create policy videos_delete_own_or_owner
  on videos for delete
  using (
    guest_id = moment.current_guest_id()
    or moment.is_event_owner(event_id)
  );

-- ----------------------------------------------------------------------------
-- face_embeddings
--   insert: server-only (AI worker uses service role, which bypasses RLS)
--   select: a guest can read embeddings for their own photos — used by the
--           /api/events/:id/match endpoint's server-side query on behalf of
--           the caller.
-- ----------------------------------------------------------------------------
create policy face_embeddings_select_own
  on face_embeddings for select
  using (
    exists (
      select 1 from photos p
       where p.id = face_embeddings.photo_id
         and p.guest_id = moment.current_guest_id()
    )
  );

-- ----------------------------------------------------------------------------
-- reactions
--   insert/delete: only as yourself
--   select: anyone in the event
-- ----------------------------------------------------------------------------
create policy reactions_select_all_in_event
  on reactions for select
  using (
    exists (
      select 1
        from photos p
        join guests g on g.event_id = p.event_id
       where p.id = reactions.photo_id
         and g.id = moment.current_guest_id()
    )
  );

create policy reactions_insert_own
  on reactions for insert
  with check (guest_id = moment.current_guest_id());

create policy reactions_delete_own
  on reactions for delete
  using (guest_id = moment.current_guest_id());
