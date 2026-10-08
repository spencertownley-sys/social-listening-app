import type { Post } from "../types";
import { getJson, nowIso, stripHtml, type Connector, type FetchRequest } from "./types";

/**
 * Mastodon public hashtag timelines (no auth needed). Full-text search on Mastodon requires an
 * account token and is opt-in per instance, so the MVP listens to hashtags derived from each
 * single-word term. MASTODON_INSTANCES: comma-separated hosts (default mastodon.social).
 */

interface MastodonStatus {
  id: string;
  url: string | null;
  uri: string;
  created_at: string;
  content: string;
  language: string | null;
  in_reply_to_id: string | null;
  reblog: MastodonStatus | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  media_attachments: { type: string; url: string; preview_url?: string }[];
  card?: { url: string } | null;
  account: { acct: string; display_name: string; followers_count: number; bot: boolean; created_at: string };
}

export function mastodonToPost(s: MastodonStatus, instance: string): Post {
  const links = [...s.content.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/\/tags\/|\/@/.test(u));
  if (s.card?.url) links.push(s.card.url);
  return {
    id: `mastodon:${s.uri}`,
    network: "mastodon",
    externalId: s.uri,
    url: s.url ?? s.uri,
    author: {
      handle: s.account.acct.includes("@") ? s.account.acct : `${s.account.acct}@${instance}`,
      displayName: s.account.display_name,
      followerCount: s.account.followers_count,
      botScore: s.account.bot ? 0.95 : undefined,
      accountCreatedAt: s.account.created_at,
    },
    text: stripHtml(s.content),
    lang: s.language ?? undefined,
    postedAt: s.created_at,
    kind: s.in_reply_to_id ? "reply" : "original",
    media: s.media_attachments.map((m) => ({
      type: m.type === "video" || m.type === "gifv" ? "video" : "image",
      url: m.url,
      thumbnailUrl: m.preview_url,
    })),
    links: [...new Set(links)],
    engagement: { likes: s.favourites_count, reposts: s.reblogs_count, replies: s.replies_count },
    ingestedAt: nowIso(),
  };
}

export function termToHashtag(term: string): string | null {
  const t = term.replace(/^#/, "").replace(/["']/g, "").replace(/\s+/g, "");
  return /^[\p{L}\p{N}_]{3,}$/u.test(t) ? t.toLowerCase() : null;
}

export const mastodonConnector: Connector = {
  network: "mastodon",
  name: "Mastodon hashtags",
  unavailableReason: () => null,
  async fetch(req: FetchRequest): Promise<Post[]> {
    const instances = (process.env.MASTODON_INSTANCES ?? "mastodon.social")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = [...new Set(req.terms.map(termToHashtag).filter((t): t is string => !!t))].slice(0, 15);
    const out: Post[] = [];
    for (const instance of instances) {
      for (const tag of tags) {
        const statuses = await getJson<MastodonStatus[]>(
          `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${Math.min(40, req.limit)}`,
        );
        for (const s of statuses) {
          if (s.reblog) continue; // the original is what we score
          if (Date.parse(s.created_at) < req.since.getTime()) continue;
          out.push(mastodonToPost(s, instance));
        }
      }
    }
    return out;
  },
};
