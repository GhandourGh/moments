# Costs

Napkin math for the AI pipeline and hosting. Update the assumptions block when
they change; the math re-runs against those numbers.

## Assumptions (one event)

- Guests: **120**
- Photos per guest: **25**  → 3,000 photos
- Videos per guest: **3**   → 360 videos, avg 8 s each
- Selfies for face-match: **1 per guest** → 120 selfies
- Face-embedding model call cost: **$0.001 per image** (typical vision endpoint tier)
- Face-match call cost: **$0.002 per selfie** (embedding + top-k search)
- Caption cost: **$0.003 per photo**
- Moderation cost: **$0.0005 per photo**
- Supabase storage: **~$0.021 per GB-month**
- Supabase egress: **~$0.09 per GB**
- Vercel: **hobby tier for MVP, Pro at $20/mo when we launch**
- Average photo size (JPEG, MAX_EDGE 1600, q 0.82): **~450 KB**
- Average video size (60s ceiling but avg 8s @ 2.5 Mbit): **~2.5 MB**

## Per-event AI cost

| Feature       | Volume       | Cost each  | Total     |
|---------------|--------------|------------|-----------|
| Embeddings    | 3,000 photos | $0.001     | **$3.00** |
| Face matches  | 120 selfies  | $0.002     | **$0.24** |
| Captions      | 3,000 photos | $0.003     | **$9.00** |
| Moderation    | 3,000 photos | $0.0005    | **$1.50** |
| **Total**     |              |            | **$13.74** |

At full-fat AI. Toggles:

- Captions off → **$4.74 / event** (biggest single line item).
- Only face-match + moderation → **$4.74 / event**.
- All AI off → **$0 / event**.

## Per-event storage cost

- Photos: 3,000 × 450 KB ≈ **1.35 GB**
- Videos: 360 × 2.5 MB ≈ **0.9 GB**
- **Total ≈ 2.25 GB** during retention window.
- Storage-months during 90-day retention: 2.25 × 3 ≈ **6.75 GB-months** → **~$0.14**.
- Egress (assume 3× viewership): 2.25 × 3 ≈ **6.75 GB** → **~$0.61**.
- **Storage + egress per event ≈ $0.75.**

## Per-event hosting cost

- Vercel functions on Pro: covered by the flat $20/mo, one event well under
  the included quota.
- Vercel bandwidth on Pro: 1 TB included, one event uses ~7 GB (10× viewership).
- **Marginal Vercel cost per event: $0.**

## Bottom line

- **All-AI budget per event**: ~$13.74 AI + $0.75 storage ≈ **$14.50**
- **Face-match-only budget per event**: ~$1.74 AI + $0.75 storage ≈ **$2.50**
- **No-AI budget per event**: ~$0.75 (storage only, plus fixed hosting)

## Decisions this drives

- **Ship with**: face-match + moderation on, captions off by default. Buys the
  most impact per dollar. Enable captions per-event.
- **Free tier ceiling**: at $2.50/event, we can run ~10 events on the pre-paid
  Anthropic credits ($20) without touching billing.
- **Kill switch**: [`config/env.js`](../src/config/env.js) `env.ai.faceMatchEnabled` (already scaffolded)
  and companion flags for `captionsEnabled`, `moderationEnabled` (add as
  needed). Any one can be flipped off per environment without a code change.

## What would blow this up

- **Photos/guest goes above 100** — real weddings do this. Cost scales linearly.
- **Video duration cap goes up** — 30 s cap × 3 videos = 3× the current
  storage. Anything above 60 s starts eating egress.
- **Caption every photo on ingest** — currently we assume captions are opt-in
  per photo (accessibility use); if we caption every upload the AI bill 3×'s.
- **Higher-res photos** — MAX_EDGE 2400 pushes average blob to ~1 MB, storage
  and egress both double.

## Re-check trigger

If a single event exceeds **$25 combined**, stop and revisit — either the
assumptions are wrong or a knob got turned that shouldn't have.
