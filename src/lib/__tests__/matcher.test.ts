import { describe, expect, it } from "vitest";
import { heuristicDraft } from "../assist";
import { demoPosts } from "../connectors/demo";
import { classifyText, enrichHeuristic } from "../enrich/heuristic";
import { applyFeedback, emptyLearning } from "../learning";
import { buildPreFilter, compileProfile, matchPost } from "../matcher";
import { dedupe } from "../pipeline";
import { parseProfileConfig, TEMPLATES, type ListeningProfile, type ProfileConfigInput } from "../profile";
import type { Post } from "../types";

let n = 0;
function profile(input: ProfileConfigInput): ListeningProfile {
  n++;
  return {
    id: `prf_test${n}`,
    workspaceId: "ws",
    version: 1,
    status: "active",
    config: parseProfileConfig(input),
    createdAt: "",
    updatedAt: String(n),
  };
}

const posts = demoPosts(Date.parse("2026-10-08T12:00:00Z"));
const enrichments = new Map(enrichHeuristic(posts).map((e) => [e.postId, e]));

function run(p: ListeningProfile, learning = emptyLearning(p.id)) {
  const c = compileProfile(p);
  return posts
    .map((post) => ({ post, m: matchPost(c, post, enrichments.get(post.id)!, learning) }))
    .filter((r) => r.m !== null);
}

describe("heuristic classifier", () => {
  it("rates clear cases", () => {
    expect(classifyText("This was amazing, best cruise ever!").sentiment).toBe("positive");
    expect(classifyText("Terrible service, rude staff, never again").sentiment).toBe("negative");
    expect(classifyText("The ship departs at 4pm").sentiment).toBe("neutral");
    expect(classifyText("not good at all").sentiment).toBe("negative");
    // Negation stops at sentence breaks, and "no refund" is not praise.
    expect(classifyText("Princess Cruises skipped Ensenada again with no explanation. Disappointed, and no refund offered.").sentiment).toBe("negative");
  });
  it("detects intents", () => {
    expect(classifyText("Any recommendations for a family cruise?").intents).toEqual(
      expect.arrayContaining(["question", "recommendation_request"]),
    );
    expect(classifyText("Feature request: please add backlinks").intents).toContain("feature_request");
    expect(classifyText("Thinking of cancelling my subscription, switching to Bear").intents).toContain("churn_risk");
  });
  it("flips sarcasm", () => {
    expect(classifyText("Oh great, another delay. Love that for us.").sentiment).not.toBe("positive");
  });
});

describe("profile config", () => {
  it("requires something to listen for and a network", () => {
    expect(() => parseProfileConfig({ name: "x", sources: { bluesky: 100 }, match: {} })).toThrow();
    expect(() => parseProfileConfig({ name: "x", sources: {}, match: { any: ["a"] } })).toThrow();
  });
  it("rejects bad query syntax at save time", () => {
    expect(() => parseProfileConfig({ name: "x", sources: { bluesky: 100 }, match: { query: "(cruise OR" } })).toThrow(/ends too early/);
    expect(() => parseProfileConfig({ name: "x", sources: { bluesky: 100 }, match: { any: ['"open'] } })).toThrow(/Unclosed quote/);
  });
  it("builds every template into a valid config", () => {
    for (const t of TEMPLATES) expect(() => parseProfileConfig(t.build(["Acme"], ["Rival"]))).not.toThrow();
  });
});

describe("matcher", () => {
  it("matches terms and explains why", () => {
    const res = run(profile({ name: "Notably", sources: { bluesky: 100, mastodon: 100, youtube: 100 }, match: { any: ["Notably"] } }));
    expect(res.length).toBe(6);
    expect(res[0].m!.reasons[0]).toEqual({ kind: "term", detail: "mentions Notably" });
  });

  it("drops giveaways, job posts and bots by default", () => {
    const res = run(profile({ name: "c", sources: { bluesky: 100 }, match: { any: ["carnival"] } }));
    const handles = res.map((r) => r.post.author.handle);
    expect(handles).not.toContain("cruisedealsbot");
    expect(handles).not.toContain("jobsatsea.bsky.social");
    expect(handles).toContain("cabin8402.bsky.social");
  });

  it("filters by source, sentiment and intent", () => {
    const crisis = run(
      profile({ name: "c", sources: { bluesky: 100 }, match: { any: ["Bean There Coffee"] }, sentiment: { keep: ["negative"] } }),
    );
    expect(crisis.every((r) => r.post.network === "bluesky")).toBe(true);
    expect(crisis.every((r) => enrichments.get(r.post.id)!.sentiment === "negative")).toBe(true);
    expect(crisis.length).toBeGreaterThan(0);

    const leads = run(
      profile({ name: "l", sources: { bluesky: 100, mastodon: 100 }, match: { any: ["coffee", "cruise"] }, intents: ["recommendation_request"] }),
    );
    expect(leads.map((r) => r.post.author.handle).sort()).toEqual(["firsttimecruiser.bsky.social", "newtopdx.bsky.social"]);
  });

  it("matches a semantic topic by its key words", () => {
    const res = run(profile({ name: "s", sources: { bluesky: 100, mastodon: 100 }, match: { semantic: "people frustrated with slow cruise ship wifi" } }));
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res.every((r) => r.m!.reasons.some((x) => x.kind === "semantic"))).toBe(true);
    // Sharing only "cruise" and "ship" with the topic is not enough.
    expect(res.some((r) => r.post.text.includes("norovirus"))).toBe(false);
  });

  it("learns from feedback: mute, correct sentiment, never this", () => {
    const p = profile({ name: "n", sources: { bluesky: 100 }, match: { any: ["Notably"] }, sentiment: { keep: ["negative"] } });
    const crash = posts.find((x) => x.text.includes("keeps crashing"))!;
    let learning = emptyLearning(p.id);
    expect(run(p, learning).some((r) => r.post.id === crash.id)).toBe(true);

    learning = applyFeedback(learning, { id: "f1", profileId: p.id, postId: crash.id, action: "wrong_sentiment", correctedSentiment: "neutral", createdAt: "" }, crash);
    expect(run(p, learning).some((r) => r.post.id === crash.id)).toBe(false);

    const churn = posts.find((x) => x.text.includes("Thinking of cancelling"))!;
    learning = applyFeedback(learning, { id: "f2", profileId: p.id, postId: churn.id, action: "mute_author", createdAt: "" }, churn);
    expect(run(p, learning).some((r) => r.post.author.handle === churn.author.handle)).toBe(false);
  });

  it("raises relevance for posts like ones rated up", () => {
    const p = profile({ name: "c", sources: { bluesky: 100, mastodon: 100 }, match: { any: ["cruise", "carnival", "royal caribbean", "princess"] } });
    const wifi = posts.find((x) => x.text.startsWith("Starlink wifi"))!;
    const before = run(p).find((r) => r.post.text.includes("Wifi so slow"))!.m!.relevance;
    let learning = emptyLearning(p.id);
    learning = applyFeedback(learning, { id: "f", profileId: p.id, postId: wifi.id, action: "more_like_this", createdAt: "" }, wifi);
    const after = run(p, learning).find((r) => r.post.text.includes("Wifi so slow"))!.m!.relevance;
    expect(after).toBeGreaterThan(before);
  });
});

describe("pre-filter and dedupe", () => {
  it("passes only posts any active profile could match", () => {
    const f = buildPreFilter([profile({ name: "p", sources: { bluesky: 100 }, match: { any: ["#deependpod", "Deep End"] } })]);
    const passed = posts.filter((p) => f.test(p));
    expect(passed.length).toBeGreaterThan(3);
    expect(passed.every((p) => /deep ?end/i.test(p.text + (p.title ?? "")))).toBe(true);
  });

  it("drops repeats and cross-posts", () => {
    const a = posts[0];
    const copy: Post = { ...a, id: "bluesky:other", externalId: "other" };
    expect(dedupe([a, a, copy]).length).toBe(1);
    expect(dedupe([a], { [a.id]: a }).length).toBe(0);
  });
});

describe("assistant fallback", () => {
  it("drafts terms and filters from plain English", () => {
    const d = heuristicDraft('Tell me when people complain about "Bean There Coffee" or #beanthere in Portland');
    expect(d.any).toEqual(expect.arrayContaining(["Bean There Coffee", "#beanthere"]));
    expect(d.sentiment_keep).toEqual(["negative", "mixed"]);
    expect(d.intents).toContain("complaint");
    expect(d.any).not.toContain("Portland"); // explicit names win over guessed ones
  });
});
