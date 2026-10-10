# Getting API access for each network

Researched October 2026. Platform terms and prices change often, so check each portal before
paying. Every key belongs to **your** account on that network: nobody can create one on your
behalf. Once you have a key, add it in Railway → project `earshot` → service `earshot-web` →
**Variables**. The service restarts, and the **Connections** page in the app shows whether it's
working.

Earshot only uses official APIs and public feeds. Several "cheap API" vendors for X, Instagram,
TikTok and LinkedIn work by scraping against those platforms' terms; we don't use them.

## At a glance

| Network | Keyword search? | Cost to start | Approval | Env vars |
|---|---|---|---|---|
| Bluesky | Real-time stream + search | Free | None | none for the stream; `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` for search |
| YouTube | Yes (videos) | Free, 10,000 units/day (~100 searches) | None to start | `YOUTUBE_API_KEY` |
| X | Yes (last 7 days) | Pay-per-use, ~$0.005 per post read | Self-serve | `X_BEARER_TOKEN`, `X_DAILY_POST_BUDGET` |
| Reddit | Yes | Free for non-commercial; commercial is negotiated | Manual access request | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` |
| Threads | Yes | Free | Meta App Review for public posts | `THREADS_ACCESS_TOKEN` |
| Instagram | Hashtags only, 30 tags/week | Free | Meta App Review + Business Verification | `IG_USER_ID`, `IG_ACCESS_TOKEN` |
| Facebook | No | n/a | n/a | — |
| TikTok | No (research-only API) | n/a | Not eligible | — |
| LinkedIn | No (own Page only) | n/a | n/a | — |

**Suggested order:** Bluesky and YouTube today (free, minutes). X next if the budget is OK. Then
start the Reddit and Meta applications, which take days to weeks.

## Bluesky (no key needed; 5 minutes for search)
New posts already arrive in real time, with no key, from Bluesky's free Jetstream firehose; the
Connections page shows the stream's status. An app password adds hourly search, which also finds
posts from before the server started (Bluesky's public search refuses anonymous requests).
1. In the Bluesky app: **Settings → Privacy and security → App passwords → Add**.
2. Set `BLUESKY_HANDLE` (e.g. `you.bsky.social`) and `BLUESKY_APP_PASSWORD`.

Settings: `BLUESKY_JETSTREAM=off` turns the stream off; `BLUESKY_FLUSH_SECONDS` (default 120)
sets how often matched posts are saved and alerted on.

## YouTube (10 minutes, free)
1. Go to https://console.cloud.google.com → create a project.
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **Credentials → Create credentials → API key**. Restrict it to YouTube Data API v3.
4. Set `YOUTUBE_API_KEY`.

Each search costs 100 of your 10,000 daily units. `YOUTUBE_MAX_TERMS` (default 10) caps searches
per run, so with hourly runs keep it around 4, or ask Google for more quota (free, needs an
audit).

## X (15 minutes, pay-per-use)
X has no free tier for new developers. Reads cost about **$0.005 per post** (≈ $5 per 1,000), with
$20 of promotional credit when you add a card.
1. Go to https://console.x.com → create a Project and an App.
2. Add a payment method and buy credits.
3. **Keys and tokens → Bearer Token → Generate**.
4. Set `X_BEARER_TOKEN`.
5. Set `X_DAILY_POST_BUDGET` to control spend: Earshot stops reading X for the day at this many
   posts. Default 300 posts/day ≈ $1.50/day ≈ $45/month. 100/day ≈ $15/month.

## Reddit (days to weeks)
Reddit now blocks anonymous API access from servers and reviews every API application by hand.
The free tier is **non-commercial**; selling a product built on Reddit data needs a separate
agreement with Reddit.
1. Sign in → https://www.reddit.com/prefs/apps → **create another app** → type **script** →
   redirect URI `http://localhost:8080`.
2. The client ID is under the app name; the secret is labelled "secret".
3. Submit Reddit's Data API access request (linked from their Responsible Builder Policy) and
   describe the use honestly. Declare commercial use if you plan to charge for Earshot.
4. Set `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and
   `REDDIT_USER_AGENT` = `web:earshot:0.2 (by /u/yourusername)`.
5. Optional: `REDDIT_SUBREDDITS` (e.g. `Cruise,CruiseLife`) to also read every new comment in
   those communities, which is where most opinions are.

## Threads (weeks, free)
1. https://developers.facebook.com/apps → **Create app** → use case **Access the Threads API**.
2. Add permissions `threads_basic` and `threads_keyword_search`; add your Threads account as a
   tester.
3. Generate a token in the app dashboard's Threads API settings (or via OAuth), and exchange it
   for a long-lived token (60 days; refresh before it expires).
4. Set `THREADS_ACCESS_TOKEN`.
5. Until Meta approves **advanced access** through App Review, search only returns your own
   posts. Submit App Review (and Business Verification if asked) to search public posts.

## Instagram (weeks, free, hashtags only)
Instagram has no free-text search for apps, only hashtags, and only 30 unique hashtags per week
per account.
1. Convert an Instagram account to **Business** or **Creator** and link it to a Facebook Page.
2. https://developers.facebook.com/apps → create a **Business** app → add the Instagram product.
3. Request `instagram_basic` and the **Instagram Public Content Access** feature in App Review;
   complete **Business Verification**.
4. Generate a long-lived token (a System User token in Business Manager doesn't expire).
5. Set `IG_USER_ID` (the Instagram Business account ID) and `IG_ACCESS_TOKEN`. Optional:
   `IG_MAX_HASHTAGS` (default 10), `META_GRAPH_VERSION`.

Add `#hashtags` to profiles you want covered on Instagram.

## Not available
- **Facebook:** no keyword search of public posts for commercial apps. Page Public Content Access
  can read known public Pages; Meta's Content Library (which can search) is for academic and
  non-profit researchers only.
- **TikTok:** the Research API is limited to academic and non-profit researchers. Licensed data
  vendors exist but most work by scraping.
- **LinkedIn:** no public post search; the Community Management API covers only Pages you
  administer.

## MCP servers
X publishes an official MCP server (XMCP), and community ones exist for YouTube, Reddit and
Bluesky. They're built for AI assistants to call a few tools interactively, not for an
always-on ingest pipeline, and they need the same keys as above. Earshot calls the APIs
directly instead.

## Also recommended
- `ANTHROPIC_API_KEY` (console.anthropic.com → API keys): Claude labels sentiment and intent far
  better than the offline classifier, and drafts profiles from plain English.
- `RESEND_API_KEY` + `DIGEST_TO`: email digests and alerts.
