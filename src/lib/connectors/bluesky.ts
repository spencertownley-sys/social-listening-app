import type { Post } from "../types";
import { getJson, nowIso, type Connector, type FetchRequest } from "./types";

/**
 * Bluesky via the AT Protocol search endpoint (app.bsky.feed.searchPosts).
 * Unauthenticated calls go to the public AppView; if BLUESKY_HANDLE and BLUESKY_APP_PASSWORD are
 * set, the connector signs in and searches through the user's PDS, which is more reliable.
 * Real-time ingest via Jetstream is the next step (see docs/BUILD_PLAN.md).
 */

interface BskyPostView {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string; createdAt?: string; labels?: { val: string }[] };
  record: {
    text?: string;
    createdAt?: string;
    langs?: string[];
    reply?: unknown;
    facets?: { features: { $type: string; uri?: string }[] }[];
  };
  embed?: {
    $type?: string;
    images?: { thumb: string; fullsize: string }[];
    external?: { uri: string; title?: string; thumb?: string };
    playlist?: string;
    thumbnail?: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  indexedAt: string;
}

let session: { accessJwt: string; service: string; expires: number } | null = null;

async function auth(): Promise<{ base: string; headers: Record<string, string> }> {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return { base: "https://public.api.bsky.app", headers: {} };
  if (!session || session.expires < Date.now()) {
    const service = process.env.BLUESKY_SERVICE ?? "https://bsky.social";
    const res = await getJson<{ accessJwt: string }>(`${service}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    session = { accessJwt: res.accessJwt, service, expires: Date.now() + 60 * 60 * 1000 };
  }
  return { base: session.service, headers: { authorization: `Bearer ${session.accessJwt}` } };
}

export function bskyToPost(v: BskyPostView): Post {
  const rkey = v.uri.split("/").pop() ?? v.cid;
  const links = new Set<string>();
  for (const f of v.record.facets ?? []) for (const feat of f.features) if (feat.uri) links.add(feat.uri);
  if (v.embed?.external?.uri) links.add(v.embed.external.uri);
  const media: Post["media"] = [];
  for (const img of v.embed?.images ?? []) media.push({ type: "image", url: img.fullsize, thumbnailUrl: img.thumb });
  if (v.embed?.playlist) media.push({ type: "video", url: v.embed.playlist, thumbnailUrl: v.embed.thumbnail });
  return {
    id: `bluesky:${rkey}`,
    network: "bluesky",
    externalId: v.uri,
    url: `https://bsky.app/profile/${v.author.handle}/post/${rkey}`,
    author: {
      handle: v.author.handle,
      displayName: v.author.displayName,
      accountCreatedAt: v.author.createdAt,
      botScore: v.author.labels?.some((l) => l.val === "bot") ? 0.9 : undefined,
    },
    text: v.record.text ?? "",
    lang: v.record.langs?.[0],
    postedAt: v.record.createdAt ?? v.indexedAt,
    kind: v.record.reply ? "reply" : "original",
    media,
    links: [...links],
    engagement: { likes: v.likeCount, reposts: (v.repostCount ?? 0) + (v.quoteCount ?? 0), replies: v.replyCount },
    ingestedAt: nowIso(),
  };
}

export const blueskyConnector: Connector = {
  network: "bluesky",
  name: "Bluesky search",
  unavailableReason: () => null,
  async fetch(req: FetchRequest): Promise<Post[]> {
    const { base, headers } = await auth();
    const out: Post[] = [];
    for (const term of req.terms) {
      const url = new URL(`${base}/xrpc/app.bsky.feed.searchPosts`);
      url.searchParams.set("q", term);
      url.searchParams.set("sort", "latest");
      url.searchParams.set("since", req.since.toISOString());
      url.searchParams.set("limit", String(Math.min(100, req.limit)));
      const res = await getJson<{ posts: BskyPostView[] }>(url.toString(), { headers });
      out.push(...res.posts.map(bskyToPost));
    }
    return out;
  },
};
