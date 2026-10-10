# Earshot — Build Plan (Phase 1 MVP)

Companion to [PRD.md](./PRD.md) and [ARCHITECTURE.md](./ARCHITECTURE.md). Tracks what is built,
what is stubbed, and the calls made where the PRD left a choice open.

## Decisions taken to start building

| Question | Decision for now | Why / how to change |
|---|---|---|
| Where does the code live? | `social-listening-app/` in CruiseNewsYouCanUse | The dedicated repo `spencertownley-sys/social-listening-app` is empty and this session can only push here. Move with `git subtree split --prefix social-listening-app` and push to the new repo when ready. |
| Launch persona (open question 1) | Not decided. Built **connector-agnostic** with creators' networks first (Bluesky, YouTube, RSS, Mastodon) | These are the PRD's cheap, legal Phase 1 networks either way. Small-business networks (Facebook/X) slot in as connectors later. |
| Storage | A JSON-file store behind a `Store` interface for local dev; Supabase schema with RLS written in `supabase/migrations/` | Lets the app run with zero setup. The Supabase adapter is the next backend task. |
| Auth | One shared workspace behind a password gate (`APP_PASSWORD`) on the hosted site | Multi-user sign-in (email + Google) arrives with Supabase Auth. |
| AI models | Enrichment: `claude-haiku-5-5` (PRD: "small fast model at volume"). Profile drafting: `claude-opus-5-5`. Both configurable through env. | If `ANTHROPIC_API_KEY` is unset, both fall back to a local heuristic so the app still works offline. |
| Semantic topics (layer 4) | Keyword-expansion match for now (topic sentence → key terms); embeddings + pgvector later | Keeps the MVP free of a vector store. |
| Queue / schedule | In-process scheduler on the Railway server (every `INGEST_INTERVAL_MINUTES`), plus `POST /api/cron` | Swap for a separate worker + Upstash/Redis streams at scale. |
| Hosting | Railway: one Next.js service, persistent volume at `/data` for the JSON store | Move to Supabase Postgres before multi-user. |

## Phase 1 checklist

**Profile builder**
- [x] Listening Profile schema (all 13 layers) with zod validation and defaults
- [x] Seven one-click templates (Brand Health, Competitor Watch, Crisis Radar, Lead Finder, Fan Love, Product Feedback, Topic Trends)
- [x] AI query assistant: plain English → keywords, exclusions, semantic topic (Claude, with heuristic fallback)
- [x] Guided 5-step builder with live preview against the last 7 days of stored posts
- [x] Profile versioning (every save snapshots a `ProfileVersion`)
- [ ] Advanced boolean editor with inline syntax errors (P1; parser already reports errors)
- [ ] Rollback UI (P1; versions are stored)

**Ingest and matching**
- [x] Connector interface + Bluesky (public search API), RSS/Atom, Mastodon (public hashtag timelines), YouTube Data API (needs `YOUTUBE_API_KEY`)
- [x] Sample connector with demo posts so the app is usable offline
- [x] Normalize + dedupe (network/external id, and near-duplicate text)
- [x] Cheap pre-filter against the union of all active profiles' terms
- [x] Enrichment: sentiment + confidence, emotions, intents (Claude batch, heuristic fallback)
- [x] Boolean query engine: AND / OR / NOT, parentheses, "exact phrases", NEAR/n proximity, #hashtags, @handles, domain:, wildcard suffix*
- [x] Matcher applying hard rules (sources, exclusions, sentiment, confidence, intents, emotions, author, content, language) and recording *why* each post matched
- [x] Relevance score from source weight, engagement, and per-profile feedback learning
- [ ] Real-time Bluesky Jetstream consumer (worker, Phase 1b)

**Feed and feedback**
- [x] Unified feed with network, author, text, sentiment/intent chips (text labels, never colour alone), confidence, and "why this matched"
- [x] UI filters/sort: network, sentiment, date, relevance, reach
- [x] Feedback: relevant / not relevant / wrong sentiment / mute author / more like this — persisted and fed back into scoring

**Dashboard**
- [x] Mention volume over time, sentiment split, top networks, top authors by reach

**Digests**
- [x] Digest builder (daily/weekly) with a preview page
- [x] Email delivery through Resend when `RESEND_API_KEY` and `DIGEST_TO` are set
- [x] Scheduled listening + alerts (in-process scheduler, `/api/cron`)
- [x] In-app notifications with unread badge
- [x] Real-time alerts, spike alerts (×N the 7-day hourly baseline), quiet hours, daily caps
- [x] Slack, Discord and webhook channels (env-configured URLs)

**Platform**
- [x] Password gate for the hosted site, live on Railway
- [x] Supabase SQL migration for the full data model with row-level security
- [ ] Supabase store adapter + Auth
- [ ] Stripe billing and plan limits (Phase 2)

## Next steps, in order

1. Supabase adapter for `Store`, plus email/Google sign-in (multi-user).
2. Bluesky Jetstream worker for real-time ingest.
3. Embedding-based semantic topics (pgvector).
4. Phase 2 connectors: Reddit, Threads; push/SMS alerts; Stripe billing.
