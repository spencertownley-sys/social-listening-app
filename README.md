# Earshot (working name) — social listening you tune like a playlist

Each user builds **Listening Profiles**: which networks to hear, what to listen for, which tone
and intent matter, and how to be told. Every result says *why* it matched, and feedback
("more like this", "wrong sentiment", "mute author") tunes the profile.

- Product spec: [docs/PRD.md](docs/PRD.md) (copied from the "Social Listening App — PRD" doc)
- How it's built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- What's done and what's next: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)

## Run it

```bash
cd social-listening-app
npm install
cp .env.example .env.local   # optional: every key is optional
npm run dev                  # http://localhost:3000
```

Then on the Profiles page click **Load demo posts** (works offline, no keys), **New profile**,
describe what you want to hear in plain English, and walk the five steps. **Listen now** pulls
live posts from the connected networks for every active profile.

```bash
npm test          # unit tests (query language, matcher, classifier, connectors)
npm run lint
npm run build
```

## What works today (Phase 1 MVP slice)

- Guided 5-step builder with AI drafting, 7 templates, live preview, and ratings during preview
- Full Listening Profile config (all 13 PRD layers), versioned on every save, with rollback
- Boolean query language: `AND OR NOT -word "phrase" NEAR/n ( ) #tag @handle domain: word*`
- Connectors: **News & RSS** (Google News search + your feeds), **Mastodon** hashtags,
  **YouTube** (with `YOUTUBE_API_KEY`), **Bluesky** (with an app password; the public
  search endpoint now refuses anonymous calls), plus an offline demo set
- Pre-filter → Claude (or offline) sentiment / emotion / intent labels → per-profile matching
- Feed with filters, "why this matched", confidence, and five feedback actions that change ranking
- Dashboard: volume by sentiment, sentiment split, networks, top authors, intents
- Digest preview and email via Resend

Data is stored in `.data/earshot.json` (git-ignored). The Supabase schema for production,
with row-level security, is in `supabase/migrations/0001_init.sql`.

## Configuration

See [.env.example](.env.example). Nothing is required; without `ANTHROPIC_API_KEY` the app uses
its offline classifier and drafting heuristics.
