import { describe, expect, it } from "vitest";
import { runAlerts } from "../alerts";
import { buildDigest } from "../digest";
import { eventToPost } from "../jetstream";
import { parseProfileConfig, type ListeningProfile } from "../profile";
import { emptyData, type StoreData } from "../store";
import type { Post, Sentiment } from "../types";

const NOW = new Date("2026-10-10T12:00:00Z");

describe("Jetstream", () => {
  it("maps create events and ignores everything else", () => {
    const post = eventToPost({
      did: "did:plc:abc",
      time_us: 1_791_633_600_000_000,
      kind: "commit",
      commit: {
        operation: "create",
        collection: "app.bsky.feed.post",
        rkey: "3kxyz",
        record: { text: "Cruise wifi is slow", createdAt: "2026-10-10T11:59:00Z", langs: ["en"], reply: {}, facets: [{ features: [{ $type: "link", uri: "https://x.y" }] }] },
      },
    });
    expect(post).toMatchObject({
      id: "bluesky:3kxyz",
      network: "bluesky",
      externalId: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
      url: "https://bsky.app/profile/did:plc:abc/post/3kxyz",
      kind: "reply",
      lang: "en",
      links: ["https://x.y"],
      postedAt: "2026-10-10T11:59:00.000Z",
    });
    expect(eventToPost({ did: "d", time_us: 1, kind: "commit", commit: { operation: "delete", collection: "app.bsky.feed.post", rkey: "r" } })).toBeNull();
    expect(eventToPost({ did: "d", time_us: 1, kind: "identity" })).toBeNull();
    expect(eventToPost({ did: "d", time_us: 1, kind: "commit", commit: { operation: "create", collection: "app.bsky.feed.like", rkey: "r", record: { text: "x" } } })).toBeNull();
  });
});

function store(spikeOn: "negative" | "all", sentiments: Sentiment[]): StoreData {
  const profile: ListeningProfile = {
    id: "p",
    workspaceId: "w",
    version: 1,
    status: "active",
    config: parseProfileConfig({ name: "Crisis", sources: { bluesky: 100 }, match: { any: ["acme"] }, delivery: { mode: "spike", spike_on: spikeOn } }),
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "",
  };
  const data: StoreData = {
    ...emptyData(),
    profiles: [profile],
    versions: [],
    posts: {},
    enrichments: {},
    matches: {},
    feedback: [],
    learning: {},
    runs: [],
    notifications: [],
    alertState: {},
  };
  sentiments.forEach((s, i) => {
    const id = `bluesky:${i}`;
    const post: Post = {
      id,
      network: "bluesky",
      externalId: String(i),
      url: "",
      author: { handle: `u${i}` },
      text: "acme",
      postedAt: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(),
      kind: "original",
      media: [],
      links: [],
      engagement: {},
      ingestedAt: "",
    };
    data.posts[id] = post;
    data.enrichments[id] = { postId: id, sentiment: s, sentimentConfidence: 0.9, emotions: [], intents: [], topics: [], model: "t" };
    data.matches[`p:${id}`] = { id: `p:${id}`, profileId: "p", profileVersion: 1, postId: id, reasons: [], relevance: 50, createdAt: NOW.toISOString() };
  });
  return data;
}

describe("spike alerts", () => {
  const mostlyHappy: Sentiment[] = ["positive", "positive", "positive", "positive", "positive", "positive", "negative", "negative"];

  it("ignore a burst of happy posts by default", async () => {
    expect(await runAlerts(store("negative", mostlyHappy), NOW)).toHaveLength(0);
  });

  it("fire on a burst of negative posts", async () => {
    const out = await runAlerts(store("negative", Array(6).fill("negative")), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].title).toMatch(/^Negative spike: 6 negative mentions/);
  });

  it("can count every mention instead", async () => {
    const out = await runAlerts(store("all", mostlyHappy), NOW);
    expect(out[0].title).toMatch(/^Spike: 8 mentions/);
  });
});

describe("digest", () => {
  it("puts the AI summary at the top when there is one", () => {
    const data = store("all", ["positive"]);
    const p = { ...data.profiles[0], config: { ...data.profiles[0].config, delivery: { ...data.profiles[0].config.delivery, mode: "digest" as const, cadence: "daily" as const } } };
    const d = buildDigest(p, [], NOW, "Mostly praise for the new ship; two questions about wifi.");
    expect(d.html).toContain("Mostly praise for the new ship");
    expect(d.text).toContain("two questions about wifi");
    expect(buildDigest(p, [], NOW).html).not.toContain("background:#f4f6fb");
  });
});
