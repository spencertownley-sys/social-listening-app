import { describe, expect, it } from "vitest";
import { hashtagsFromTerms, igToPost } from "../connectors/instagram";
import { threadsToPost } from "../connectors/threads";
import { buildXQueries, xBudgetLeft, xToPosts } from "../connectors/x";

describe("X", () => {
  it("packs terms into OR queries under 512 characters, excluding retweets", () => {
    const qs = buildXQueries(["cruise", '"royal caribbean"', "#cruiselife"]);
    expect(qs).toEqual(['(cruise OR "royal caribbean" OR #cruiselife) -is:retweet']);
    const many = buildXQueries(Array.from({ length: 80 }, (_, i) => `term${i}withsomelength`));
    expect(many.length).toBeGreaterThan(1);
    expect(many.every((q) => q.length <= 512)).toBe(true);
  });

  it("maps tweets with users, media and kinds", () => {
    const posts = xToPosts({
      data: [
        {
          id: "1",
          text: "Love this ship",
          author_id: "u1",
          created_at: "2026-10-09T00:00:00Z",
          public_metrics: { like_count: 5, retweet_count: 1, reply_count: 2, quote_count: 1 },
          referenced_tweets: [{ type: "replied_to", id: "0" }],
          entities: { urls: [{ expanded_url: "https://example.com/a" }, { expanded_url: "https://x.com/foo/status/2" }] },
          attachments: { media_keys: ["m1"] },
        },
      ],
      includes: {
        users: [{ id: "u1", username: "sea", name: "Sea", public_metrics: { followers_count: 900 } }],
        media: [{ media_key: "m1", type: "photo", url: "https://pbs/1.jpg" }],
      },
    });
    expect(posts[0]).toMatchObject({
      id: "x:1",
      url: "https://x.com/sea/status/1",
      kind: "reply",
      links: ["https://example.com/a"],
      engagement: { likes: 5, reposts: 2, replies: 2 },
    });
    expect(posts[0].author).toMatchObject({ handle: "@sea", followerCount: 900 });
    expect(posts[0].media[0].type).toBe("image");
  });

  it("enforces a daily read budget", () => {
    process.env.X_DAILY_POST_BUDGET = "50";
    expect(xBudgetLeft(new Date("2030-01-01T00:00:00Z"))).toBe(50);
    delete process.env.X_DAILY_POST_BUDGET;
  });
});

describe("Threads and Instagram", () => {
  it("maps Threads posts", () => {
    expect(threadsToPost({ id: "9", text: "hi", timestamp: "2026-10-09T00:00:00Z", username: "amy", permalink: "https://www.threads.net/@amy/post/9", is_reply: true })).toMatchObject({
      id: "threads:9",
      network: "threads",
      kind: "reply",
      author: { handle: "@amy" },
    });
  });

  it("picks hashtags first and stays under the weekly cap", () => {
    expect(hashtagsFromTerms(["#CruiseLife", "cruise", '"royal caribbean"', "ab"], 10)).toEqual(["cruiselife", "cruise"]);
    expect(hashtagsFromTerms(Array.from({ length: 40 }, (_, i) => `#t${i}xx`), 10)).toHaveLength(10);
  });

  it("maps Instagram hashtag media", () => {
    expect(igToPost({ id: "5", caption: "Sunset #cruise", timestamp: "2026-10-09T00:00:00Z", media_type: "IMAGE", like_count: 3 }, "cruise")).toMatchObject({
      id: "instagram:5",
      network: "instagram",
      text: "Sunset #cruise",
      engagement: { likes: 3 },
    });
  });
});
