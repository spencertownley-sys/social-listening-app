# Earshot — Architecture (as built)

How the PRD's pipeline maps onto the code. See [PRD.md](./PRD.md) for the why and
[BUILD_PLAN.md](./BUILD_PLAN.md) for status.

```
 Connectors ──▶ dedupe ──▶ cheap pre-filter ──▶ AI enrichment ──▶ profile matcher ──▶ matches
 (src/lib/connectors)  (pipeline.ts)  (matcher.ts:              (enrich/claude.ts,     (matcher.ts)        │
  bluesky, rss/news,                   buildPreFilter)           heuristic.ts)                             ▼
  mastodon, youtube,                                                                         feed · dashboard · digest
  demo                                                                                        (app/, analytics.ts, digest.ts)
                                                                                                         │
                         Listening Profiles (profile.ts, versioned in profiles.ts) ◀── feedback (learning.ts)
```

## Modules

| File | Role |
|---|---|
| `src/lib/types.ts` | Normalized `Post`, `Enrichment`, `Match`, `Feedback` and the enums (networks, sentiments, emotions, intents) |
| `src/lib/profile.ts` | Listening Profile schema (all 13 PRD layers, zod), validation, templates |
| `src/lib/query.ts` | Boolean query language: parser, evaluator, "why" hit labels, search-term extraction |
| `src/lib/semantic.ts` | Layer 4 topic sentences (keyword-stem overlap for now; embeddings later) |
| `src/lib/connectors/*` | One file per network; each returns normalized `Post`s |
| `src/lib/pipeline.ts` | Ingest run, dedupe, preview, rematch after edits |
| `src/lib/matcher.ts` | Hard rules → relevance score → reasons; the union pre-filter |
| `src/lib/enrich/claude.ts` | Batched labelling with Claude (structured output), heuristic fallback |
| `src/lib/enrich/heuristic.ts` | Offline lexicon classifier |
| `src/lib/assist.ts` | Plain English → profile draft (Claude, heuristic fallback) |
| `src/lib/learning.ts` | Feedback → per-profile token weights, mutes, sentiment corrections |
| `src/lib/analytics.ts` / `digest.ts` | Feed assembly, dashboard aggregates, digest email |
| `src/lib/store.ts` | Storage interface; JSON-file implementation for local dev |
| `supabase/migrations/0001_init.sql` | Production schema with row-level security |

## Key design choices

- **Ingest once, match many.** Connectors search for the union of every active profile's
  positive terms. The pre-filter drops posts no profile could match *before* enrichment, so
  AI cost scales with relevant volume, not firehose volume.
- **Hard rules before soft scores.** Sources, exclusions, what-to-hear, author, content,
  language and sentiment/intent filters are binary. Only survivors get a relevance score
  (source weight, engagement, number of hits, label confidence, learned affinity).
- **Explainability is data.** Every `Match` stores `reasons[]`; the UI renders them as
  "Why this matched". Every label shows its confidence and can be corrected.
- **Feedback doesn't fork the profile.** Mutes, corrections and learned weights live in
  `LearningState`, so a thumbs-down never bumps the profile version. Config edits do, and
  each version is snapshotted for rollback.
- **Connectors are plug-ins.** Adding Reddit/Threads/X is a new file implementing
  `Connector`; nothing else changes. `LIVE_NETWORKS` in `profile.ts` marks what is wired up.
- **No scraping.** Every connector uses an official API or public feed.

## Models

| Step | Default | Env override | Notes |
|---|---|---|---|
| Sentiment / emotion / intent | `claude-haiku-5-5`, effort low, 25 posts per call, cached system prompt | `ENRICH_MODEL` | PRD: "small fast model at volume" |
| Profile drafting | `claude-opus-5-5`, effort low, server-side fallback on | `ASSIST_MODEL` | PRD: "larger model for profile drafting" |

Both use structured outputs (zod schemas) and fall back to the heuristics on refusal, API
error, or missing credentials.

## Moving to production

1. Implement `Store` against Supabase (`0001_init.sql`), with Supabase Auth for sign-in.
2. Move `runIngest` into a Railway worker on a schedule; add a Bluesky Jetstream consumer for real time.
3. Put a queue (Upstash/Redis streams) between connectors and enrichment.
4. Replace `semanticMatch` with embeddings in `enrichments.embedding` (pgvector).
