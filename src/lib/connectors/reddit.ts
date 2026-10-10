import type { Post } from "../types";
import { decodeEntities, getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * Reddit through its official Data API.
 *
 * Auth: app-only OAuth (client_credentials) with REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET from a
 * "script" or "web" app at https://www.reddit.com/prefs/apps. Reddit asks every client to send a
 * unique, descriptive User-Agent (REDDIT_USER_AGENT, e.g. "web:earshot:0.2 (by /u/yourname)").
 * Without credentials the connector tries the public JSON endpoints, which Reddit usually refuses
 * from cloud servers; the run log then says to add the credentials.
 *
 * What it reads, per run:
 *  - search: newest posts across Reddit matching each profile term (`/search?sort=new`)
 *  - REDDIT_SUBREDDITS (optional, comma-separated): the newest comments in those subreddits,
 *    which is where most opinions live. The pre-filter keeps only comments matching a profile.
 */

interface Listing<T> {
  data: { children: { kind: string; data: T }[] };
}

interface RedditPost {
  id: string;
  name: string;
  title: string;
  selftext?: string;
  author: string;
  subreddit: string;
  permalink: string;
  url?: string;
  created_utc: number;
  score?: number;
  num_comments?: number;
  is_video?: boolean;
  post_hint?: string;
  thumbnail?: string;
  over_18?: boolean;
  is_self?: boolean;
}

interface RedditComment {
  id: string;
  name: string;
  body: string;
  author: string;
  subreddit: string;
  permalink: string;
  link_title?: string;
  created_utc: number;
  score?: number;
}

const OAUTH_BASE = "https://oauth.reddit.com";
const PUBLIC_BASE = "https://www.reddit.com";

function userAgent(): string {
  return process.env.REDDIT_USER_AGENT || "web:earshot-social-listening:0.2 (self-hosted)";
}

let token: { value: string; expires: number } | null = null;

export function redditCredentials(): { id: string; secret: string } | null {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

async function auth(): Promise<{ base: string; headers: Record<string, string> }> {
  const creds = redditCredentials();
  if (!creds) return { base: PUBLIC_BASE, headers: { "user-agent": userAgent() } };
  if (!token || token.expires < Date.now() + 60_000) {
    const res = await fetch(`${PUBLIC_BASE}/api/v1/access_token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent(),
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Reddit sign-in failed (${res.status}); check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  }
  return { base: OAUTH_BASE, headers: { authorization: `Bearer ${token.value}`, "user-agent": userAgent() } };
}

function permalink(p: string): string {
  return `https://www.reddit.com${p}`;
}

export function redditPostToPost(p: RedditPost): Post {
  const media: Post["media"] = [];
  if (p.is_video) media.push({ type: "video", url: permalink(p.permalink) });
  else if (p.post_hint === "image" && p.url) media.push({ type: "image", url: p.url, thumbnailUrl: p.thumbnail?.startsWith("http") ? p.thumbnail : undefined });
  const external = !p.is_self && p.url && !p.url.includes("reddit.com") ? [p.url] : [];
  return {
    id: `reddit:${p.name}`,
    network: "reddit",
    externalId: p.name,
    url: permalink(p.permalink),
    author: { handle: `u/${p.author}`, displayName: `u/${p.author} in r/${p.subreddit}` },
    title: decodeEntities(p.title),
    text: decodeEntities(p.selftext ?? "").slice(0, 4000),
    postedAt: new Date(p.created_utc * 1000).toISOString(),
    kind: "original",
    media,
    links: external,
    engagement: { likes: p.score, replies: p.num_comments },
    ingestedAt: nowIso(),
  };
}

export function redditCommentToPost(c: RedditComment): Post {
  return {
    id: `reddit:${c.name}`,
    network: "reddit",
    externalId: c.name,
    url: permalink(c.permalink),
    author: { handle: `u/${c.author}`, displayName: `u/${c.author} in r/${c.subreddit}` },
    title: c.link_title ? `Re: ${decodeEntities(c.link_title)}` : undefined,
    text: decodeEntities(c.body).slice(0, 4000),
    postedAt: new Date(c.created_utc * 1000).toISOString(),
    kind: "reply",
    media: [],
    links: [],
    engagement: { likes: c.score },
    ingestedAt: nowIso(),
  };
}

const MAX_TERMS = Number(process.env.REDDIT_MAX_TERMS ?? 15);

export const redditConnector: Connector = {
  network: "reddit",
  name: "Reddit",
  unavailableReason: () => null,
  async fetch(req: FetchRequest): Promise<Post[]> {
    const { base, headers } = await auth();
    const sinceSec = req.since.getTime() / 1000;
    const out: Post[] = [];
    const errors: string[] = [];

    for (const term of req.terms.slice(0, MAX_TERMS)) {
      const url = new URL(`${base}/search${base === PUBLIC_BASE ? ".json" : ""}`);
      url.search = new URLSearchParams({ q: term, sort: "new", t: "week", limit: String(Math.min(100, req.limit)), type: "link", raw_json: "1" }).toString();
      try {
        const res = await getJson<Listing<RedditPost>>(url.toString(), { headers });
        for (const c of res.data.children) if (!c.data.over_18 && c.data.created_utc >= sinceSec) out.push(redditPostToPost(c.data));
      } catch (e) {
        errors.push((e as Error).message);
        if (/\b40[13]\b/.test((e as Error).message)) break; // blocked: no point trying more terms
      }
    }

    const subs = (process.env.REDDIT_SUBREDDITS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^r\//i, ""))
      .filter((s) => /^[A-Za-z0-9_]{2,21}$/.test(s));
    for (const sub of subs.slice(0, 20)) {
      const url = `${base}/r/${sub}/comments${base === PUBLIC_BASE ? ".json" : ""}?limit=100&raw_json=1`;
      try {
        const res = await getJson<Listing<RedditComment>>(url, { headers });
        for (const c of res.data.children) if (c.data.created_utc >= sinceSec && c.data.body !== "[deleted]") out.push(redditCommentToPost(c.data));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    if (out.length === 0 && errors.length > 0) {
      const hint = redditCredentials() ? "" : " — add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (free app at reddit.com/prefs/apps)";
      throw new Error(`${errors[0]}${hint}`);
    }
    return out;
  },
};
