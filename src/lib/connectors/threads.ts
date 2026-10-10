import type { Post } from "../types";
import { getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * Threads keyword search (graph.threads.net/v1.0/keyword_search) with a long-lived user token
 * (THREADS_ACCESS_TOKEN) that has threads_basic + threads_keyword_search.
 *
 * Until Meta approves the app for advanced access (App Review), keyword search only returns the
 * token owner's own posts; after approval it searches public posts. Meta allows 2,200 queries per
 * user per 24 hours. Long-lived tokens last 60 days and must be refreshed (see docs/API_ACCESS.md).
 */

interface ThreadsPost {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  username?: string;
  is_reply?: boolean;
  is_quote_post?: boolean;
}

export function threadsToPost(t: ThreadsPost): Post {
  const isVideo = t.media_type === "VIDEO";
  return {
    id: `threads:${t.id}`,
    network: "threads",
    externalId: t.id,
    url: t.permalink ?? `https://www.threads.net/t/${t.id}`,
    author: { handle: t.username ? `@${t.username}` : "threads user" },
    text: t.text ?? "",
    postedAt: t.timestamp,
    kind: t.is_reply ? "reply" : "original",
    media: t.media_url ? [{ type: isVideo ? "video" : "image", url: t.media_url, thumbnailUrl: t.thumbnail_url }] : [],
    links: [],
    engagement: {},
    ingestedAt: nowIso(),
  };
}

const MAX_TERMS = Number(process.env.THREADS_MAX_TERMS ?? 20);

export const threadsConnector: Connector = {
  network: "threads",
  name: "Threads keyword search",
  unavailableReason: () => (process.env.THREADS_ACCESS_TOKEN ? null : "Set THREADS_ACCESS_TOKEN to listen on Threads (see docs/API_ACCESS.md)."),
  async fetch(req: FetchRequest): Promise<Post[]> {
    const out: Post[] = [];
    for (const term of req.terms.slice(0, MAX_TERMS)) {
      const isTag = term.startsWith("#");
      const url = new URL("https://graph.threads.net/v1.0/keyword_search");
      url.search = new URLSearchParams({
        q: isTag ? term.slice(1) : term.replace(/^"|"$/g, ""),
        search_type: "RECENT",
        search_mode: isTag ? "TAG" : "KEYWORD",
        since: String(Math.floor(req.since.getTime() / 1000)),
        limit: String(Math.min(100, req.limit)),
        fields: "id,text,media_type,media_url,thumbnail_url,permalink,timestamp,username,is_reply,is_quote_post",
        access_token: process.env.THREADS_ACCESS_TOKEN!,
      }).toString();
      const res = await getJson<{ data: ThreadsPost[] }>(url.toString());
      out.push(...res.data.map(threadsToPost));
    }
    return out;
  },
};
