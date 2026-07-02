-- Per-event frontend content (hero, texts, story, schedule…).
--
-- Free-form jsonb owned by the host and edited from /host. The client merges
-- it over the built-in defaults (src/config/couple.js), so an empty object
-- renders the stock experience. Shape (all keys optional):
--   { coupleNames, initials, dateDisplay, hashtag, heroLede, heroImageUrl,
--     dressCode, schedule: [{time,title,detail}], story: [{title,body,pull,image,alt}] }
alter table events
  add column if not exists content jsonb not null default '{}'::jsonb;

-- Hosts write whole documents from a trusted admin endpoint; 32 KB is
-- generous for text content and stops accidental payload abuse.
alter table events
  add constraint events_content_size check (pg_column_size(content) <= 32768);
