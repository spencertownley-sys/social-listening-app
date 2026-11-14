import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FeedItem } from "../analytics";
import { safeHttpUrl, sanitizePostUrls } from "../connectors/types";
import { buildDigest } from "../digest";
import { parseFeed, itemToPost } from "../connectors/rss";
import { mastodonToPost } from "../connectors/mastodon";
import { parseProfileConfig, type ListeningProfile } from "../profile";

process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-links-")), "store.json");
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

const hostileFeed = `<rss><channel>
<item><title>Cruise news</title><link>javascript:alert(1)</link><guid>item-1</guid><description>cruise wifi</description></item>
<item><title>Fine</title><link>https://news.example/ok</link><description>cruise wifi</description></item>
</channel></rss>`;

describe("post links", () => {
  it("keeps only http(s) URLs", () => {
    expect(safeHttpUrl("https://a.example/x?y=1")).toBe("https://a.example/x?y=1");
    expect(safeHttpUrl("http://a.example")).toBe("http://a.example");
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>", "/relative", "vbscript:x", "", undefined, null]) {
      expect(safeHttpUrl(bad as string)).toBe("");
    }
  });

  it("stores an RSS item with a javascript: link with an empty url", async () => {
    const [bad, good] = parseFeed(hostileFeed).map((i) => itemToPost(i, "https://feed.example/rss"));
    expect(bad).toMatchObject({ url: "", links: [] });
    expect(good).toMatchObject({ url: "https://news.example/ok", links: ["https://news.example/ok"] });
  });

  it("cleans every URL a post carries at ingest", () => {
    const post = mastodonToPost(
      {
        id: "1",
        uri: "https://m.example/statuses/1",
        url: "javascript:alert(1)",
        content: '<p>hi <a href="javascript:alert(2)">x</a> <a href="https://ok.example">y</a></p>',
        created_at: "2026-11-01T00:00:00Z",
        language: "en",
        in_reply_to_id: null,
        replies_count: 0,
        reblogs_count: 0,
        favourites_count: 0,
        media_attachments: [{ type: "image", url: "javascript:alert(3)", preview_url: "https://img.example/p.jpg" }],
        card: { url: "data:text/html,x" },
        account: { acct: "a", display_name: "A", followers_count: 1, bot: false, created_at: "2020-01-01T00:00:00Z" },
      } as never,
      "m.example",
    );
    expect(post.url).toBe("");
    expect(post.links).toEqual(["https://ok.example"]);
    expect(post.media).toEqual([{ type: "image", url: "", thumbnailUrl: "https://img.example/p.jpg" }]);
    const again = sanitizePostUrls({ ...post, url: "javascript:x", links: ["javascript:y", "https://ok.example"] });
    expect(again.url).toBe("");
    expect(again.links).toEqual(["https://ok.example"]);
  });

  describe("through the pipeline", () => {
    let store: typeof import("../store");
    let pipeline: typeof import("../pipeline");
    beforeAll(async () => {
      store = await import("../store");
      pipeline = await import("../pipeline");
    });
    beforeEach(async () => {
      const { rm } = await import("node:fs/promises");
      await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
      store.__resetStoreCache();
    });

    it("never stores a javascript: link, even from a connector that forgot to clean it", async () => {
      const [bad] = parseFeed(hostileFeed).map((i) => itemToPost(i, "https://feed.example/rss"));
      await pipeline.ingestPosts([{ ...bad!, url: "javascript:alert(1)", links: ["javascript:alert(1)"] }], { prefilter: false, alerts: false });
      const stored = Object.values((await store.read()).posts);
      expect(stored).toHaveLength(1);
      expect(stored[0].url).toBe("");
      expect(JSON.stringify(stored)).not.toContain("javascript:");
    });
  });

  it("leaves unsafe links out of the digest", () => {
    const profile: ListeningProfile = {
      id: "p",
      workspaceId: "w",
      version: 1,
      status: "active",
      config: parseProfileConfig({ name: "Cruise", sources: { news: 100 }, match: { any: ["cruise"] }, delivery: { mode: "digest", cadence: "daily" } }),
      createdAt: "",
      updatedAt: "",
    };
    const now = new Date("2026-11-14T12:00:00Z");
    const post = { ...itemToPost(parseFeed(hostileFeed)[0], "https://feed.example/rss")!, postedAt: "2026-11-14T11:00:00Z" };
    const item = {
      post: { ...post, url: "javascript:alert(1)" },
      match: { relevance: 1, reasons: [] },
      enrichment: { postId: post.id, sentiment: "neutral", emotions: [], intents: [], topics: [] },
      sentiment: "neutral",
      corrected: false,
    } as unknown as FeedItem;
    const d = buildDigest(profile, [item], now);
    expect(d.items).toHaveLength(1);
    expect(d.html).not.toContain("javascript:");
    expect(d.html).not.toContain("Open original");
    expect(d.text).not.toContain("javascript:");
  });
});
