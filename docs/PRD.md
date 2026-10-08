# Social Listening App — PRD

2026-10-07 · Spencer · Status: Draft v0.1 (planning)

> Source of truth: the Claude Doc "Social Listening App — PRD"
> (https://claude.ai/code/artifact/dfef7707-b4b4-4a98-ad1f-fbc9c5abed21). This file is a copy
> taken 2026-10-08 so the build can reference it from the repo. Edit the doc first, then re-sync.

Repo: https://github.com/spencertownley-sys/social-listening-app (empty as of 2026-10-08; the
MVP is being built in `social-listening-app/` of CruiseNewsYouCanUse until it moves there).

## Overview

A web app where every user builds their own "ears": they pick which networks to listen to, what
to listen for, which sentiment they care about, and how they want to hear about it. The backend
treats each user's setup as a first-class, versioned object (a **Listening Profile**) rather than
a set of global filters.

**Problem.** Enterprise tools (Brandwatch, Sprout, Talkwalker, Meltwater) are priced and designed
for agencies. Creators, small businesses and solo marketers get either a blunt keyword alert or
nothing. They also can't say "only show me negative posts about my brand from people with real
reach on Bluesky and TikTok" without a sales call.

**Target users.** Solo creators and podcasters, small and mid-size businesses, freelance
marketers, PR people, product managers tracking feedback, and researchers following a topic.

**Positioning.** "Social listening you set up in five minutes and tune like a playlist."
Self-serve, priced per profile, with customization depth that enterprise tools hide behind
consultants.

**Working name.** TBD (placeholder: *Earshot*).

## Goals, non-goals, success metrics

**Goals (v1)**

- A new user creates a working Listening Profile in under 5 minutes, with no keyword-syntax knowledge.
- Every result can be traced to *why* it matched (which rule, which sentiment score).
- Users tune results by giving feedback ("more like this", "never this"), and the profile learns.
- Alerts arrive where the user already is: email, push, Slack, SMS.

**Non-goals (v1)**

- Posting, scheduling or replying on behalf of users (that's a publishing tool).
- Private or DM content of any kind.
- Influencer marketplace or paid outreach.
- Full historical archive beyond 90 days.

**Success metrics**

| Metric | Target (6 months post-launch) |
|---|---|
| Time to first useful result | under 10 minutes |
| Profiles with at least one feedback action in week 1 | 60% |
| Precision on user-rated results ("relevant") | 80%+ |
| Week-4 retention, paid users | 70% |
| Alert false-positive complaints | under 5% of alerts |

## Personas and core use cases

| Persona | What they want to hear | Typical profile |
|---|---|---|
| Solo creator / podcaster | Mentions of their show, guests, episode topics; fan reactions | Bluesky + YouTube + TikTok, positive and question posts, weekly digest |
| Small business owner | Complaints and praise about the business and competitors in their city | Facebook + X + Threads, negative only, real-time alert |
| Freelance marketer | Brand health for 3 to 10 clients, side by side | One profile per client, shared read-only links |
| PR / crisis lead | Spikes in negative volume, high-reach posters | All networks, negative + angry, spike alert to SMS |
| Product manager | Feature requests, bugs, churn signals | X + Bluesky + YouTube comments, intent = request or complaint |
| Researcher / hobbyist | Conversation trends on a topic (e.g. cruise industry) | Topic keywords, any sentiment, trend charts |

**Core use cases**

1. Brand monitoring: "Tell me when people talk about X."
2. Sentiment watch: "Only the angry ones" or "only the happy ones I can reshare."
3. Competitor tracking: "What do people dislike about my competitor?"
4. Lead finding: "People asking for a recommendation in my category."
5. Trend discovery: "What's rising in my niche this week?"
6. Crisis detection: "Wake me up if negative volume triples."

## The Listening Profile (deep personalization)

Every user can own many Listening Profiles; each one is a full recipe for what to hear, stored
server-side and applied to every post at ingest time. Users set it through a guided builder, and
power users can open an advanced editor. Each layer below is optional except Sources and What.

| Layer | What the user controls | Options |
|---|---|---|
| 1. Sources | Which networks to listen to, toggled individually | Bluesky, X, Threads, Facebook (public pages), YouTube (videos + comments), TikTok, Reddit, Instagram (business), news/blogs, podcasts (transcripts), Mastodon |
| 2. Source weighting | How much each network matters in digests and scores | Slider per network, 0 to 100 |
| 3. What to hear | Keywords, phrases, brand names, hashtags, @handles, URLs/domains, plus plain-English topic descriptions | AND / OR / NOT, exact phrase, proximity ("within 5 words"), misspellings and nicknames auto-suggested |
| 4. Semantic topics | Describe it in a sentence; we match by meaning, not just words | e.g. "people frustrated with cruise ship Wi-Fi" |
| 5. Exclusions | What to never show | Words, accounts, domains, topics, "jobs posts", "giveaways", "bots" |
| 6. Sentiment | Which emotional tone to keep | Positive, Neutral, Negative, Mixed; plus a confidence threshold slider |
| 7. Emotion and intent | Finer than sentiment | Emotions: joy, anger, frustration, fear, sarcasm, excitement. Intents: complaint, praise, question, recommendation request, purchase intent, churn risk, feature request |
| 8. Author filters | Who is speaking | Follower range, verified only, exclude own accounts, language, location (where known), account age, likely-bot score |
| 9. Content filters | What kind of post | Original vs reply vs repost, has media, has link, min engagement, video only |
| 10. Geography and language | Where and in what language | Countries / regions, languages (auto-translate on/off) |
| 11. Delivery | How and when they hear about it | Real-time push, hourly, daily or weekly digest, spike-only; channels: in-app, email, push, SMS, Slack, Discord, webhook |
| 12. Quiet hours and caps | Keep alerts humane | Quiet hours, max alerts per day, bundle similar alerts |
| 13. Learning | Feedback that tunes the profile | Thumbs up/down, "more like this", "mute this author", "wrong sentiment"; each feeds a per-profile relevance model |

**Guided builder flow (onboarding)**

1. "What do you want to listen for?" Free text; AI drafts keywords, exclusions and a topic description.
2. Pick sources (cards with logos, all on by default).
3. Pick the sentiment and intents that matter (chips: "Complaints", "Praise", "Questions" ...).
4. Live preview: 20 sample matches from the last 7 days; user rates a few.
5. Choose delivery. Done.

**Profile templates.** One-click starters: Brand Health, Competitor Watch, Crisis Radar, Lead
Finder, Fan Love, Product Feedback, Topic Trends.

**Example stored profile (backend)**

```json
{
  "profile_id": "prf_123",
  "name": "Podcast fan love",
  "version": 7,
  "sources": {"bluesky": 100, "youtube": 80, "tiktok": 60, "x": 0},
  "match": {
    "any": ["\"my podcast name\"", "@myhandle", "#mypodcast"],
    "semantic": "listeners talking about episodes they enjoyed",
    "exclude": ["giveaway", "author:own_accounts"]
  },
  "sentiment": {"keep": ["positive", "mixed"], "min_confidence": 0.7},
  "intents": ["praise", "question"],
  "author": {"min_followers": 50, "exclude_bots": true},
  "language": ["en"],
  "delivery": {"mode": "digest", "cadence": "weekly", "channels": ["email", "push"]},
  "quiet_hours": {"start": "22:00", "end": "07:00", "tz": "America/Los_Angeles"}
}
```

## Functional requirements

Priority: **P0** = MVP, **P1** = fast follow, **P2** = later.

**Accounts and workspaces**

- P0: Email/Google sign-in; one workspace per account; profiles live in a workspace.
- P1: Team seats with roles (owner, editor, viewer); share a profile as a read-only link.
- P2: Client workspaces for agencies, white-label reports.

**Profile builder**

- P0: Guided builder (5 steps above), templates, live preview against last 7 days.
- P0: AI query assistant turns plain English into keywords, exclusions and a semantic topic.
- P1: Advanced boolean editor with syntax validation; profile versioning and rollback.
- P1: Duplicate a profile; compare two profiles' results.

**Feed (the "inbox")**

- P0: Unified, de-duplicated stream of matches; each card shows network, author, text, media
  thumbnail, sentiment and intent chips, and a "why this matched" line.
- P0: Filter and sort in the UI without editing the profile (date, network, sentiment, reach).
- P0: Feedback actions: relevant / not relevant, wrong sentiment, mute author, more like this.
- P1: Save, tag and add notes to posts; bulk export to CSV.
- P1: Open original post; copy link; translate.

**Analytics dashboard**

- P0: Mention volume over time, sentiment split, top networks, top authors by reach.
- P1: Share of voice versus competitors, emerging terms and hashtags, emotion breakdown.
- P1: Spike detection marked on the timeline with the posts that drove it.
- P2: Topic clustering (AI-labelled themes), audience geography.

**Alerts and digests**

- P0: Email digest (daily/weekly) and in-app notifications.
- P1: Push, Slack, Discord, SMS, webhooks; spike alerts with thresholds ("3x normal negative
  volume in 1 hour").
- P1: AI digest summary: "This week: 142 mentions, mostly positive; 3 complaints about audio quality."

**Reports**

- P1: Scheduled PDF/link reports per profile.
- P2: Branded report templates for agencies.

## Platform coverage and data access

Data access is the biggest risk in this product: networks differ wildly in what they allow, and
terms change often. The table below is a planning snapshot from general knowledge, not verified
for October 2026; confirm each network's current API terms and pricing before building.

| Network | Likely access route | Ease | Notes |
|---|---|---|---|
| Bluesky | Open AT Protocol firehose / Jetstream | Easy | Public, real-time, free; best launch network |
| YouTube | YouTube Data API (search, videos, comments) | Medium | Daily quota limits; comments are rich for sentiment |
| Reddit | Reddit Data API (commercial terms) | Medium | Paid for commercial use; very high signal for opinions |
| Mastodon | Public instance streaming APIs | Easy | Fragmented across instances |
| News, blogs, RSS, podcasts | RSS + news APIs; transcript services | Easy | Cheap, broad coverage |
| X | Official X API, paid tiers | Hard (cost) | Search and stream are expensive; price into higher plans |
| Threads | Meta Threads API (keyword search where available) | Medium | Check rate limits and commercial terms |
| Facebook | Graph API for pages the user connects; public content is heavily restricted | Hard | Plan for "connect your own pages" first |
| Instagram | Graph API for connected business accounts, hashtag search limits | Hard | Business accounts only |
| TikTok | Research API is academic-only; commercial access limited | Hard | Consider licensed data vendors |

**Approach.** Build a connector layer so each network is a plug-in. Launch with Bluesky, YouTube,
Reddit, news/RSS and Mastodon (cheap and legal). Add X and Threads in paid tiers. For Facebook,
Instagram and TikTok, evaluate licensed data resellers (e.g. firehose vendors) rather than
scraping. **No scraping that breaks a platform's terms of service.**

## System architecture and data model

Posts are ingested once for everyone, cheaply pre-filtered against the union of all users'
keywords, enriched by AI only if they survive, then matched against each Listening Profile. This
keeps per-user customization deep without paying to run AI on the whole firehose.

```
Connectors ─▶ Ingest queue ─▶ Normalize + dedupe ─▶ Cheap pre-filter (union of all profiles)
                                                              │
                                                              ▼
Matches store ◀── Profile matcher (rules + relevance) ◀── AI enrichment (sentiment, intent)
   │      │                       ▲
   ▼      ▼                       │
Feed +  Alerts +            Listening Profiles (versioned, one per goal)
dashboard digests                 ▲
   └──── user feedback tunes the profile ────┘
```

The matcher applies each profile's hard rules (sources, sentiment, author filters) first, then a
per-profile relevance score learned from that user's feedback.

**Core data model**

| Entity | Key fields |
|---|---|
| User | id, email, plan, timezone |
| Workspace | id, owner_id, seats, plan limits |
| ListeningProfile | id, workspace_id, name, version, config (JSON, as above), status |
| ProfileVersion | profile_id, version, config snapshot, created_at (enables rollback) |
| Connector | network, auth type, rate limits, health status |
| Post | id, network, external_id, author_id, text, media, lang, posted_at, engagement, url |
| Author | id, network, handle, follower_count, bot_score, verified |
| Enrichment | post_id, sentiment, sentiment_confidence, emotions[], intents[], topics[], embedding |
| Match | profile_id, post_id, matched_rules[], relevance_score, created_at |
| Feedback | match_id, user_id, action (relevant, wrong_sentiment, mute_author...) |
| AlertRule | profile_id, type (digest, real-time, spike), threshold, channels, quiet_hours |
| AlertEvent | rule_id, sent_at, channel, match_ids[] |

**Suggested stack (starting point)**

- Frontend: Next.js + Tailwind; charts with Recharts.
- Backend: Supabase (Postgres, auth, row-level security) plus worker services.
- Queue: a managed queue (e.g. Upstash/Redis streams or SQS).
- Search and matching: Postgres full-text + pgvector for semantic topics; move to a dedicated
  search engine at scale.
- AI: a small fast model for sentiment/intent at volume; a larger model for profile drafting and
  weekly summaries.
- Hosting: Vercel (web) + Railway (workers); Stripe for billing; Resend for email.

## Non-functional, privacy, compliance

- **Latency:** real-time profiles surface matches within 2 minutes of ingest; digests on schedule within 15 minutes.
- **Scale (v1 target):** 1,000 users, 5,000 profiles, 5 million posts/day ingested.
- **Retention:** raw posts 90 days; aggregates kept 2 years. Honour platform deletion signals (deleted posts are removed).
- **Privacy:** public content only; no DMs, no private groups. Never build per-person dossiers;
  author views are limited to public profile + their matching posts.
- **Compliance:** GDPR/CCPA data-subject requests; platform developer terms per connector; clear
  terms that users may not use the app for harassment or surveillance of individuals.
- **Security:** OAuth tokens for connected accounts encrypted at rest; per-workspace data isolation (row-level security).
- **Accessibility:** WCAG 2.1 AA; sentiment never shown by colour alone.
- **Explainability:** every AI label shows a confidence score and can be corrected by the user.

## Monetization, roadmap, risks, open questions

**Pricing hypothesis**

| Plan | Price / month | Profiles | Networks | Delivery |
|---|---|---|---|---|
| Free | $0 | 1 | Bluesky, YouTube, RSS | Weekly digest |
| Creator | $19 | 5 | + Reddit, Mastodon, Threads | Daily digest, push |
| Pro | $79 | 20 | + X | Real-time, spike alerts, Slack |
| Agency | $249+ | Unlimited, client workspaces | All, incl. licensed data | White-label reports, API |

**Phased roadmap**

1. **Phase 0 — Validate (4 weeks):** 15 user interviews, landing page with waitlist, confirm API costs per network.
2. **Phase 1 — MVP (8 to 10 weeks):** guided builder, Bluesky + YouTube + RSS connectors, sentiment + intent, feed with feedback, email digest.
3. **Phase 2 — Beta (6 weeks):** Reddit, Threads, Mastodon; analytics dashboard; push/Slack alerts; Stripe billing.
4. **Phase 3 — Launch:** X connector on Pro, spike alerts, AI weekly summaries, team seats.
5. **Phase 4 — Scale:** licensed data for Facebook/Instagram/TikTok, agency workspaces, public API.

**Risks**

- API access or pricing changes (X, Meta, TikTok) break coverage. Mitigation: connector layer, multi-vendor, honest per-plan coverage.
- Sentiment accuracy on sarcasm and slang. Mitigation: LLM classifier + per-profile feedback loop.
- Ingest cost grows faster than revenue. Mitigation: pre-filter cheaply before LLM labelling; cap profiles per plan.
- Misuse for stalking individuals. Mitigation: terms, author-tracking limits, abuse review.

**Open questions**

- [ ] Which single persona do we launch for first: creators or small businesses?
  *(Doc comment, 2026-10-07: "Launch persona: creators (Bluesky/YouTube heavy) or small
  businesses (Facebook/X heavy)? It changes which connectors come first.")*
- [ ] Buy licensed data for Meta/TikTok at launch, or wait for traction?
- [ ] Is real-time a paid-only feature?
- [ ] Final product name and domain.
