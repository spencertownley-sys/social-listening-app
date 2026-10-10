import { describe, expect, it } from "vitest";
import { balanceByNetwork, type FeedItem } from "../analytics";
import { redditCommentToPost, redditPostToPost } from "../connectors/reddit";
import { dedupe, storyKey } from "../pipeline";
import { DEFAULT_WEIGHTS, LIVE_NETWORKS, parseProfileConfig, TEMPLATES } from "../profile";
import type { Network, Post } from "../types";

function post(network: Network, id: string, extra: Partial<Post> = {}): Post {
  return {
    id: `${network}:${id}`,
    network,
    externalId: id,
    url: `https://example.com/${id}`,
    author: { handle: `${id}-author` },
    text: `text ${id}`,
    postedAt: "2026-10-09T00:00:00Z",
    kind: "original",
    media: [],
    links: [],
    engagement: {},
    ingestedAt: "2026-10-09T00:00:00Z",
    ...extra,
  };
}

function item(network: Network, id: string, relevance: number): FeedItem {
  return {
    post: post(network, id),
    match: { id, profileId: "p", profileVersion: 1, postId: id, reasons: [], relevance, createdAt: "" },
    enrichment: { postId: id, sentiment: "neutral", sentimentConfidence: 0.5, emotions: [], intents: [], topics: [], model: "t" },
    sentiment: "neutral",
    corrected: false,
  };
}

describe("Reddit mapping", () => {
  it("maps posts and comments to the normalized schema", () => {
    const p = redditPostToPost({
      id: "abc",
      name: "t3_abc",
      title: "Alaska &amp; grandparents?",
      selftext: "Any recommendations?",
      author: "balcony",
      subreddit: "Cruise",
      permalink: "/r/Cruise/comments/abc/alaska/",
      url: "https://www.reddit.com/r/Cruise/comments/abc/alaska/",
      created_utc: 1_791_500_000,
      score: 12,
      num_comments: 4,
      is_self: true,
    });
    expect(p).toMatchObject({
      id: "reddit:t3_abc",
      network: "reddit",
      url: "https://www.reddit.com/r/Cruise/comments/abc/alaska/",
      title: "Alaska & grandparents?",
      links: [],
      engagement: { likes: 12, replies: 4 },
    });
    expect(p.author.handle).toBe("u/balcony");
    const c = redditCommentToPost({ id: "x", name: "t1_x", body: "Never sailing again", author: "a", subreddit: "Cruise", permalink: "/r/Cruise/comments/abc/alaska/x/", link_title: "Alaska", created_utc: 1_791_500_000 });
    expect(c).toMatchObject({ id: "reddit:t1_x", kind: "reply", title: "Re: Alaska" });
  });
});

describe("news weighting", () => {
  it("collapses the same headline from different outlets", () => {
    const a = post("news", "1", { title: "Royal Caribbean raises full-year guidance on record bookings - Reuters", author: { handle: "Reuters" } });
    const b = post("news", "2", { title: "Royal Caribbean raises full-year guidance on record bookings - CNBC", author: { handle: "CNBC" } });
    const c = post("news", "3", { title: "Carnival cuts outlook", author: { handle: "Reuters" } });
    expect(storyKey(a.title!)).toBe(storyKey(b.title!));
    expect(dedupe([a, b, c]).map((p) => p.id)).toEqual(["news:1", "news:3"]);
  });

  it("starts new profiles with news low and Reddit on", () => {
    expect(LIVE_NETWORKS).toContain("reddit");
    expect(DEFAULT_WEIGHTS.news).toBeLessThan(DEFAULT_WEIGHTS.reddit!);
    const cfg = parseProfileConfig(TEMPLATES[0].build(["Acme"]));
    expect(cfg.sources.news).toBe(30);
  });

  it("balances the feed so one network can't take the first page", () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => item("news", `n${i}`, 90 - i)),
      item("reddit", "r1", 60),
      item("reddit", "r2", 55),
      item("bluesky", "b1", 50),
    ];
    const top5 = balanceByNetwork(items, { news: 30, reddit: 100, bluesky: 100 }).slice(0, 5).map((i) => i.post.network);
    expect(top5.filter((n) => n === "news").length).toBeLessThanOrEqual(2);
    expect(top5).toContain("reddit");
    expect(top5).toContain("bluesky");
    // Within a network, relevance order is kept.
    const reddit = balanceByNetwork(items, { reddit: 100 }).filter((i) => i.post.network === "reddit").map((i) => i.post.externalId);
    expect(reddit).toEqual(["r1", "r2"]);
  });
});
