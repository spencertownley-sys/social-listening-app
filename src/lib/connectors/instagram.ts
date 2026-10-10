import type { Post } from "../types";
import { getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * Instagram hashtag search through the Instagram Graph API, for an Instagram Business or Creator
 * account linked to a Facebook Page: IG_USER_ID + IG_ACCESS_TOKEN (needs instagram_basic and the
 * Instagram Public Content Access feature, granted through Meta App Review).
 *
 * Instagram has no free-text search: only hashtags. Meta allows 30 unique hashtags per account
 * per rolling 7 days, so this connector queries at most IG_MAX_HASHTAGS (default 10) tags, taken
 * from the profiles' #hashtags first, then single-word terms. Hashtag media doesn't include the
 * author's username.
 */

interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

const VERSION = process.env.META_GRAPH_VERSION ?? "v22.0";
const g = globalThis as typeof globalThis & { __earshotIgTags?: Map<string, string> };

export function hashtagsFromTerms(terms: string[], max: number): string[] {
  const tags = terms.filter((t) => t.startsWith("#")).map((t) => t.slice(1));
  const words = terms.filter((t) => /^[\p{L}\p{N}_]{3,}$/u.test(t));
  return [...new Set([...tags, ...words].map((t) => t.toLowerCase()))].slice(0, max);
}

export function igToPost(m: IgMedia, tag: string): Post {
  return {
    id: `instagram:${m.id}`,
    network: "instagram",
    externalId: m.id,
    url: m.permalink ?? `https://www.instagram.com/`,
    author: { handle: `#${tag}`, displayName: `Instagram post tagged #${tag}` },
    text: m.caption ?? "",
    postedAt: m.timestamp,
    kind: "original",
    media: m.media_url ? [{ type: m.media_type === "VIDEO" ? "video" : "image", url: m.media_url }] : [],
    links: [],
    engagement: { likes: m.like_count, replies: m.comments_count },
    ingestedAt: nowIso(),
  };
}

export const instagramConnector: Connector = {
  network: "instagram",
  name: "Instagram hashtags",
  unavailableReason: () =>
    process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN ? null : "Set IG_USER_ID and IG_ACCESS_TOKEN to listen on Instagram hashtags (see docs/API_ACCESS.md).",
  async fetch(req: FetchRequest): Promise<Post[]> {
    const user = process.env.IG_USER_ID!;
    const token = process.env.IG_ACCESS_TOKEN!;
    const cache = (g.__earshotIgTags ??= new Map());
    const out: Post[] = [];
    for (const tag of hashtagsFromTerms(req.terms, Number(process.env.IG_MAX_HASHTAGS ?? 10))) {
      let id = cache.get(tag);
      if (!id) {
        const found = await getJson<{ data: { id: string }[] }>(
          `https://graph.facebook.com/${VERSION}/ig_hashtag_search?user_id=${user}&q=${encodeURIComponent(tag)}&access_token=${token}`,
        );
        id = found.data[0]?.id;
        if (!id) continue;
        cache.set(tag, id);
      }
      const media = await getJson<{ data: IgMedia[] }>(
        `https://graph.facebook.com/${VERSION}/${id}/recent_media?user_id=${user}&fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`,
      );
      for (const m of media.data) if (Date.parse(m.timestamp) >= req.since.getTime()) out.push(igToPost(m, tag));
    }
    return out;
  },
};
