import type { StoreData } from "./store";
import { NETWORK_LABELS, type Enrichment, type Match, type Network, type Post, type Sentiment } from "./types";

export interface FeedItem {
  match: Match;
  post: Post;
  enrichment: Enrichment;
  sentiment: Sentiment; // after user correction
  corrected: boolean;
}

export function feedFor(data: StoreData, profileId: string): FeedItem[] {
  const overrides = data.learning[profileId]?.sentimentOverrides ?? {};
  const items: FeedItem[] = [];
  for (const m of Object.values(data.matches)) {
    if (m.profileId !== profileId) continue;
    const post = data.posts[m.postId];
    const enrichment = data.enrichments[m.postId];
    if (!post || !enrichment) continue;
    const corrected = overrides[post.id];
    items.push({ match: m, post, enrichment, sentiment: corrected ?? enrichment.sentiment, corrected: !!corrected });
  }
  return items;
}

export interface Dashboard {
  total: number;
  netSentiment: number | null; // (pos - neg) / total * 100
  volume: { day: string; positive: number; neutral: number; negative: number; mixed: number }[];
  sentimentSplit: { sentiment: Sentiment; count: number }[];
  networks: { network: string; count: number }[];
  topAuthors: { handle: string; network: string; reach: number; posts: number }[];
  intents: { intent: string; count: number }[];
}

export function dashboardFor(items: FeedItem[], days = 14): Dashboard {
  const dayKey = (iso: string) => iso.slice(0, 10);
  const today = new Date();
  const volume: Dashboard["volume"] = [];
  const byDay = new Map<string, Dashboard["volume"][number]>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const row = { day: d, positive: 0, neutral: 0, negative: 0, mixed: 0 };
    volume.push(row);
    byDay.set(d, row);
  }
  const split: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  const nets = new Map<Network, number>();
  const authors = new Map<string, Dashboard["topAuthors"][number]>();
  const intents = new Map<string, number>();
  for (const it of items) {
    split[it.sentiment]++;
    const row = byDay.get(dayKey(it.post.postedAt));
    if (row) row[it.sentiment]++;
    nets.set(it.post.network, (nets.get(it.post.network) ?? 0) + 1);
    const key = `${it.post.network}:${it.post.author.handle}`;
    const a = authors.get(key) ?? { handle: it.post.author.handle, network: NETWORK_LABELS[it.post.network], reach: 0, posts: 0 };
    a.reach = Math.max(a.reach, it.post.author.followerCount ?? it.post.engagement.views ?? 0);
    a.posts++;
    authors.set(key, a);
    for (const i of it.enrichment.intents) intents.set(i, (intents.get(i) ?? 0) + 1);
  }
  const total = items.length;
  return {
    total,
    netSentiment: total ? Math.round(((split.positive - split.negative) / total) * 100) : null,
    volume,
    sentimentSplit: (Object.keys(split) as Sentiment[]).map((s) => ({ sentiment: s, count: split[s] })),
    networks: [...nets.entries()].map(([n, count]) => ({ network: NETWORK_LABELS[n], count })).sort((a, b) => b.count - a.count),
    topAuthors: [...authors.values()].sort((a, b) => b.reach - a.reach).slice(0, 8),
    intents: [...intents.entries()].map(([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count),
  };
}
