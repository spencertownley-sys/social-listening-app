import type { Post } from "../types";
import { getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * X (Twitter) API v2 recent search (last 7 days) with an app-only Bearer token (X_BEARER_TOKEN,
 * from console.x.com → your app → Keys and tokens).
 *
 * X bills per post read (pay-per-use), so this connector spends from a daily budget:
 * X_DAILY_POST_BUDGET posts per UTC day (default 300). Terms are OR-ed into as few queries as
 * fit X's 512-character limit, retweets are excluded, and each run reads at most what is left.
 */

interface XResponse {
  data?: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    lang?: string;
    public_metrics?: { like_count: number; retweet_count: number; reply_count: number; quote_count: number; impression_count?: number };
    referenced_tweets?: { type: "replied_to" | "quoted" | "retweeted"; id: string }[];
    entities?: { urls?: { expanded_url: string }[] };
    attachments?: { media_keys?: string[] };
  }[];
  includes?: {
    users?: { id: string; username: string; name: string; verified?: boolean; created_at?: string; public_metrics?: { followers_count: number } }[];
    media?: { media_key: string; type: string; url?: string; preview_image_url?: string }[];
  };
  meta?: { result_count: number; next_token?: string };
}

const MAX_QUERY = 512;
const SUFFIX = " -is:retweet";

/** Pack terms into OR-queries that fit X's length limit. */
export function buildXQueries(terms: string[]): string[] {
  const queries: string[] = [];
  let current: string[] = [];
  const render = (ts: string[]) => (ts.length === 1 ? ts[0] : `(${ts.join(" OR ")})`) + SUFFIX;
  for (const t of terms) {
    if (render([...current, t]).length > MAX_QUERY && current.length) {
      queries.push(render(current));
      current = [];
    }
    if (render([t]).length <= MAX_QUERY) current.push(t);
  }
  if (current.length) queries.push(render(current));
  return queries;
}

const g = globalThis as typeof globalThis & { __earshotXSpend?: { day: string; posts: number } };

export function xBudgetLeft(now = new Date()): number {
  const budget = Number(process.env.X_DAILY_POST_BUDGET ?? 300);
  const day = now.toISOString().slice(0, 10);
  if (!g.__earshotXSpend || g.__earshotXSpend.day !== day) g.__earshotXSpend = { day, posts: 0 };
  return Math.max(0, budget - g.__earshotXSpend.posts);
}

function spend(n: number): void {
  xBudgetLeft();
  g.__earshotXSpend!.posts += n;
}

export function xToPosts(res: XResponse): Post[] {
  const users = new Map((res.includes?.users ?? []).map((u) => [u.id, u]));
  const media = new Map((res.includes?.media ?? []).map((m) => [m.media_key, m]));
  return (res.data ?? []).map((t): Post => {
    const u = users.get(t.author_id);
    const refs = t.referenced_tweets ?? [];
    const m = t.public_metrics;
    return {
      id: `x:${t.id}`,
      network: "x",
      externalId: t.id,
      url: `https://x.com/${u?.username ?? "i"}/status/${t.id}`,
      author: {
        handle: u ? `@${u.username}` : t.author_id,
        displayName: u?.name,
        followerCount: u?.public_metrics?.followers_count,
        verified: u?.verified,
        accountCreatedAt: u?.created_at,
      },
      text: t.text,
      lang: t.lang,
      postedAt: t.created_at,
      kind: refs.some((r) => r.type === "replied_to") ? "reply" : refs.some((r) => r.type === "retweeted") ? "repost" : "original",
      media: (t.attachments?.media_keys ?? [])
        .map((k) => media.get(k))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => ({ type: x.type === "photo" ? ("image" as const) : ("video" as const), url: x.url ?? x.preview_image_url ?? "", thumbnailUrl: x.preview_image_url ?? x.url })),
      links: (t.entities?.urls ?? []).map((u) => u.expanded_url).filter((u) => !/^https?:\/\/(x|twitter)\.com\//.test(u)),
      engagement: m ? { likes: m.like_count, reposts: m.retweet_count + m.quote_count, replies: m.reply_count, views: m.impression_count } : {},
      ingestedAt: nowIso(),
    };
  });
}

export const xConnector: Connector = {
  network: "x",
  name: "X recent search",
  unavailableReason: () => (process.env.X_BEARER_TOKEN ? null : "Set X_BEARER_TOKEN to listen on X (pay-per-use; see docs/API_ACCESS.md)."),
  async fetch(req: FetchRequest): Promise<Post[]> {
    const headers = { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` };
    const out: Post[] = [];
    for (const query of buildXQueries(req.terms)) {
      const left = xBudgetLeft();
      if (left < 10) break; // X's minimum page size is 10
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.search = new URLSearchParams({
        query,
        max_results: String(Math.min(100, left, Math.max(10, req.limit))),
        start_time: new Date(Math.max(req.since.getTime(), Date.now() - 6.9 * 86_400_000)).toISOString(),
        "tweet.fields": "created_at,lang,public_metrics,referenced_tweets,entities,author_id,attachments",
        expansions: "author_id,attachments.media_keys",
        "user.fields": "username,name,verified,created_at,public_metrics",
        "media.fields": "type,url,preview_image_url",
      }).toString();
      const res = await getJson<XResponse>(url.toString(), { headers });
      spend(res.meta?.result_count ?? res.data?.length ?? 0);
      out.push(...xToPosts(res));
    }
    return out;
  },
};
