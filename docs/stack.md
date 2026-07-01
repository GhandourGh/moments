# Stack

The four things this app runs on, and why. Update this file when a pick
changes — never in a commit message.

## Picks

| Layer     | Choice                         | One-line why                                                                 |
|-----------|--------------------------------|------------------------------------------------------------------------------|
| Hosting   | **Vercel**                     | Matches the Vite build; edge + serverless functions in one project.          |
| DB + storage + auth | **Supabase**         | Postgres + object storage + RLS + realtime + magic-link auth in one product. |
| AI provider | **Anthropic (Claude)**       | Called only through a Vercel Function `/api/ai/*` gateway; no keys on device.|
| Errors    | **Sentry**                     | One SDK for the frontend and for serverless functions.                       |

## Pins

Locked so `npm install` and `vercel deploy` don't move under us.

- **Node**: 20.x LTS (matches Vercel's default runtime)
- **Package manager**: `npm` (already in the repo; no reason to change)
- **Vite**: 5.4.x (from [moment/package.json](../package.json))
- **React**: 18.3.x
- **Vercel CLI**: `>=32`
- **Supabase CLI**: `>=1.180`
- **Vercel project name**: `moments`
- **Supabase project name**: `Moments`
- **Supabase project region**: _pending — pick closest to guests when creating the project_
- **Vercel project region**: `iad1` default (change to closer region if guests are outside US East)

## Environments

| Env         | URL                                           | Backend URL (`VITE_API_BASE`) | Notes                                  |
|-------------|-----------------------------------------------|-------------------------------|----------------------------------------|
| local       | `https://<lan-ip>:5174`                       | local Vercel dev or preview   | HTTPS is mandatory for the camera.     |
| preview     | `https://moment-<branch>.vercel.app`          | same host                     | Every PR gets one automatically.       |
| production  | `https://moment.<domain>`                     | same host                     | Custom domain on the main Vercel proj. |

Frontend + serverless functions live in the **same Vercel project**
(monorepo layout: `moment/api/*.ts` for functions, `moment/src/` for the UI).
One deploy = one atomic release.

## Observability floor

Ship these together with the first real endpoint — pick now so it's not a debate later.

- **Errors** — Sentry on both `services/api` and every function under `moment/api/`. DSN in Vercel env, not in code.
- **Logs** — Vercel built-in log drains. Structured JSON only. Revisit if traffic warrants log aggregation.
- **Uptime** — Vercel dashboard is enough for MVP; add Better Stack later if we need SLOs.

## When to revisit

Trigger a stack conversation only if one of these breaks:

- Supabase RLS becomes a bottleneck (unlikely at party scale).
- Anthropic gateway latency exceeds ~2 s p95 for a face-match round trip.
- Vercel function cold starts hurt the capture-upload path.

Anything short of that: keep going, don't re-litigate.
