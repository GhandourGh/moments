# Supabase

Migrations for the Moments Postgres schema. Runs against the Supabase project
named `Moments` (see [docs/stack.md](../docs/stack.md)).

## Apply

Local, via the Supabase CLI:

```bash
supabase link --project-ref <ref>   # one time
supabase db push
```

Or remote, via the SQL editor: open each file under `migrations/` in order and run.

## Files

- `20260701000001_init.sql` — Tables + indexes + `updated_at` trigger. Enables
  RLS on every table but does **not** yet define policies.
- `20260701000002_rls.sql` — Row-Level Security policies (added when the
  first mutating endpoint lands).
- `20260701000003_storage.sql` — Storage buckets for `photos/` and `videos/`
  (added alongside the upload endpoints).

## Conventions

- Timestamps in the filename are UTC. Migrations run in filename order.
- One-way only — never write a `down.sql`. Roll forward with a new migration.
- Match column names to [docs/data-model.md](../docs/data-model.md). If a
  migration disagrees with the doc, fix the doc in the same commit.
