import type { Post } from "../types";
import { decodeEntities, nowIso, stripHtml, type Connector, type FetchRequest } from "./types";

/**
 * News, blogs and podcasts through RSS/Atom.
 *  - RSS_FEEDS: comma-separated feed URLs that are always read (blogs, podcast feeds, trade press).
 *  - NEWS_SEARCH_RSS (default on): one Google News RSS search per profile term.
 * Items are kept only if they pass the pre-filter, like every other source.
 */

interface FeedItem {
  title: string;
  link: string;
  date?: string;
  body: string;
  author?: string;
  guid?: string;
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    items.push({
      title: stripHtml(tag(b, "title") ?? ""),
      link: tag(b, "link") ?? "",
      date: tag(b, "pubDate") ?? tag(b, "dc:date"),
      body: stripHtml(tag(b, "description") ?? tag(b, "content:encoded") ?? ""),
      author: tag(b, "dc:creator") ?? tag(b, "author") ?? tag(b, "source"),
      guid: tag(b, "guid"),
    });
  }
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const href = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? "";
    items.push({
      title: stripHtml(tag(b, "title") ?? ""),
      link: decodeEntities(href),
      date: tag(b, "published") ?? tag(b, "updated"),
      body: stripHtml(tag(b, "summary") ?? tag(b, "content") ?? ""),
      author: tag(tag(b, "author") ?? "", "name"),
      guid: tag(b, "id"),
    });
  }
  return items;
}

function feedHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "feed";
  }
}

export function itemToPost(item: FeedItem, feedUrl: string): Post | null {
  if (!item.link && !item.guid) return null;
  const postedAt = item.date && !Number.isNaN(Date.parse(item.date)) ? new Date(item.date).toISOString() : nowIso();
  const host = feedHost(item.link || feedUrl);
  const key = item.guid || item.link;
  return {
    id: `news:${Buffer.from(key).toString("base64url").slice(0, 48)}`,
    network: "news",
    externalId: key,
    url: item.link,
    author: { handle: item.author || host, displayName: item.author || host },
    title: item.title,
    text: item.body.slice(0, 4000),
    postedAt,
    kind: "original",
    media: [],
    links: item.link ? [item.link] : [],
    engagement: {},
    ingestedAt: nowIso(),
  };
}

async function readFeed(url: string): Promise<Post[]> {
  const res = await fetch(url, {
    headers: { "user-agent": "Earshot/0.1 (social listening; public data only)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} from ${feedHost(url)}`);
  return parseFeed(await res.text())
    .map((i) => itemToPost(i, url))
    .filter((p): p is Post => p !== null);
}

export const rssConnector: Connector = {
  network: "news",
  name: "News & RSS",
  unavailableReason: () => null,
  async fetch(req: FetchRequest): Promise<Post[]> {
    const feeds = (process.env.RSS_FEEDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (process.env.NEWS_SEARCH_RSS !== "0") {
      for (const term of req.terms.slice(0, 20)) {
        feeds.push(`https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=en-US&gl=US&ceid=US:en`);
      }
    }
    const results = await Promise.allSettled(feeds.map(readFeed));
    const posts = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (posts.length === 0 && results.length > 0 && results.every((r) => r.status === "rejected")) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
    return posts.filter((p) => Date.parse(p.postedAt) >= req.since.getTime());
  },
};
