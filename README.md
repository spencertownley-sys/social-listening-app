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
- Connectors: **Reddit**, **X**, **Threads**, **Instagram** hashtags, **YouTube**, **Bluesky**,
  **Mastodon** and **News & RSS**, plus an offline demo set. Most need a key from your own
  account on that network: see [docs/API_ACCESS.md](docs/API_ACCESS.md) and the in-app
  **Connections** page
- News is weighted low by default, syndicated copies of a story collapse into one, and the feed
  balances networks so articles don't drown out conversation
- Pre-filter → Claude (or offline) sentiment / emotion / intent labels → per-profile matching
- Feed with filters, "why this matched", confidence, and five feedback actions that change ranking
- Dashboard: volume by sentiment, sentiment split, networks, top authors, intents
- Digest preview and email via Resend
- Bluesky in real time through its free firehose (no key needed)
- Scheduled listening (hourly by default) with real-time, spike (negative-only by default) and
  digest alerts, AI-written digest summaries when Claude is configured, quiet hours
  and daily caps; in-app notifications plus email, Slack, Discord and webhook delivery
- Accounts: email + password sign-in, invite links, and owner / editor / viewer roles;
  owners can export their workspace as JSON

## Hosting (Railway)

Live at https://earshot-listening.up.railway.app. It runs as one Railway service (project
`earshot`) that deploys this repo's `main` branch, with data in a Railway Postgres database
(`DATABASE_URL`). Turn on backups in the Postgres service's **Backups** tab. Add any of the
optional keys below in the service's Variables tab. The server listens on a schedule
(`INGEST_INTERVAL_MINUTES`, default 60); `POST /api/cron` with `Authorization: Bearer
$CRON_SECRET` runs a cycle on demand.

**Accounts.** Everything except `/login`, `/setup` and `/signup` needs a signed-in user. On a
new site, open `/setup` to create the first account; on the hosted site this asks for a setup
code, which is the value of `APP_PASSWORD`. The first account owns the existing workspace and
its data. Invite others from **Account**: each invite link works once, for 7 days, and gives
the role you picked (viewers can read but not change anything). Sessions are signed with
`AUTH_SECRET`, which is **required in production**: set it to at least 32 random characters
(`openssl rand -base64 48`), different from `APP_PASSWORD`. Without it sign-in fails. Changing it
signs everyone out.

Without `DATABASE_URL`, data is stored in `.data/earshot.json` (git-ignored), or in
`EARSHOT_DATA_FILE`. The first time the server starts against an empty database it imports that
file, so moving from the file to Postgres needs no manual step.

**Backups.** Railway's Hobby plan can't create database backups, so Earshot makes its own: every
night (08:00 UTC) it saves the whole dataset as a `.json.gz` file in `/data/backups` (the last 7
are kept). Owners can download backups or make one from **Account**. When `RESEND_API_KEY` is set,
a notice is emailed to the site's owners (or `BACKUP_TO`). The email carries a copy only when
`BACKUP_ENCRYPTION_KEY` is set (32 random bytes, base64: `openssl rand -base64 32`): that copy
leaves out password hashes and is encrypted with AES-256-GCM, named `….json.gz.enc`. Keep the key
somewhere other than the mailbox.

To restore, start Earshot against an empty database with `EARSHOT_DATA_FILE` pointing at the
backup file: it is imported on first start.

- A file downloaded from **Account** (or taken from `/data/backups`) restores as it is, passwords
  included.
- An emailed copy must be decrypted first:
  `BACKUP_ENCRYPTION_KEY=<key> node scripts/decrypt-backup.mjs earshot-<date>.json.gz.enc`
  writes `earshot-<date>.json.gz` next to it. Because it has no password hashes, nobody can sign in
  after the import, so `/setup` opens again: enter the setup code (`APP_PASSWORD`) with an owner's
  email to set a new password for that account. Other members can't sign in until an owner removes
  them on **Account** and sends them a new invite.

## Configuration

See [.env.example](.env.example). Locally nothing is required; in production `AUTH_SECRET` is.
Without `ANTHROPIC_API_KEY` the app uses its offline classifier and drafting heuristics.
