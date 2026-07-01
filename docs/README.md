# Moment docs

The source of truth for backend, hosting, and AI decisions. Written before any
of it is built so the frontend, backend, and provider setup can move in
parallel without stepping on each other.

Read in this order:

1. **[stack.md](./stack.md)** — the four platform picks (Vercel, Supabase, Anthropic, Sentry) and the version pins.
2. **[data-model.md](./data-model.md)** — Postgres schema + RLS intent.
3. **[auth.md](./auth.md)** — named per-device identity, session cookie, upgrade path to magic links.
4. **[api-contract.md](./api-contract.md)** — every endpoint the client can call, with request/response shapes and error codes.
5. **[privacy.md](./privacy.md)** — what we collect, who sees what, retention, delete rights, AI opt-in.
6. **[costs.md](./costs.md)** — per-event AI + storage budget with the knobs that would change it.

## Change control

- If code disagrees with a doc, the doc is authoritative — fix the code.
- Material changes bump the doc, get a paragraph in the commit message
  explaining why, and — for `privacy.md` — a re-consent banner on next visit.
- Never update a stack pick in a commit message alone. Update `stack.md`.
