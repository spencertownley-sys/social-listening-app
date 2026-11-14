import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseProfileConfig } from "../profile";
import type { Post } from "../types";

// The store reads EARSHOT_DATA_FILE when it loads, so point it at a temp file before importing it.
process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-erasure-")), "store.json");
delete process.env.DATABASE_URL;

let store: typeof import("../store");
let a: typeof import("../accounts");
let forgetAuthor: typeof import("../forget").forgetAuthor;

beforeAll(async () => {
  store = await import("../store");
  a = await import("../accounts");
  ({ forgetAuthor } = await import("../forget"));
});

function post(id: string, network: Post["network"], handle: string): Post {
  return {
    id,
    network,
    externalId: id,
    url: `https://example.com/${id}`,
    author: { handle },
    text: "hello",
    postedAt: "2026-11-01T00:00:00Z",
    kind: "original",
    media: [],
    links: [],
    engagement: {},
    ingestedAt: "2026-11-01T00:00:00Z",
  };
}

describe("forgetting a post author", () => {
  it("leaves no posts, labels, matches, alert lines or mutes for that handle", () => {
    const data = store.emptyData();
    data.posts.a = post("a", "bluesky", "Someone.bsky.social");
    data.posts.b = post("b", "bluesky", "someone.bsky.social");
    data.posts.c = post("c", "mastodon", "someone.bsky.social");
    data.posts.d = post("d", "bluesky", "other.bsky.social");
    data.enrichments.a = { postId: "a" } as never;
    data.matches.m = { id: "m", postId: "a", profileId: "p" } as never;
    data.feedback.push({ id: "f", profileId: "p", postId: "b", action: "mute_author", createdAt: "" });
    data.learning.p = { profileId: "p", tokenWeights: {}, mutedAuthors: ["someone.bsky.social", "keep.me"], sentimentOverrides: { a: "negative" }, feedbackCount: 1 };
    const config = parseProfileConfig({ name: "P", sources: { bluesky: 100 }, match: { any: ["x"] } });
    config.author.muted = ["@Someone.bsky.social"];
    data.profiles.push({ id: "p", workspaceId: "w", version: 1, status: "active", config, createdAt: "", updatedAt: "" });
    data.notifications.push({
      id: "n",
      profileId: "p",
      kind: "digest",
      title: "Today",
      body: "• [negative] Bluesky · someone.bsky.social: hello\n• [positive] Bluesky · other.bsky.social: hi",
      postIds: ["a", "d"],
      channels: ["in_app"],
      createdAt: "",
      read: false,
    });

    const result = forgetAuthor(data, "bluesky", " @someone.bsky.social ");
    expect(result).toEqual({ posts: 2, mutes: 2 });
    expect(Object.values(data.posts).filter((p) => p.network === "bluesky" && p.author.handle.toLowerCase() === "someone.bsky.social")).toHaveLength(0);
    expect(Object.keys(data.posts).sort()).toEqual(["c", "d"]);
    expect(data.enrichments).toEqual({});
    expect(data.matches).toEqual({});
    expect(data.feedback).toEqual([]);
    expect(data.learning.p.mutedAuthors).toEqual(["keep.me"]);
    expect(data.learning.p.sentimentOverrides).toEqual({});
    expect(data.profiles[0].config.author.muted).toEqual([]);
    expect(data.notifications[0].body).not.toContain("someone.bsky.social");
    expect(data.notifications[0].postIds).toEqual(["d"]);
  });
});

describe("deleting your own account", () => {
  beforeEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
    store.__resetStoreCache();
    process.env.APP_PASSWORD = "setup-code";
  });

  it("removes the user and memberships, but never the last owner", async () => {
    const o = await a.setupFirstAccount({ setupCode: "setup-code", email: "o@example.com", name: "O", password: "owner-password" });
    const octx = a.contextFor(await store.read(), o.id)!;
    await expect(a.deleteOwnAccount(octx, "owner-password")).rejects.toMatchObject({ status: 409 });
    const { token } = await a.createInvite(octx, "editor");
    const e = await a.signupWithInvite({ token, email: "e@example.com", name: "E", password: "editor-password" });
    const ectx = a.contextFor(await store.read(), e.id)!;
    await expect(a.deleteOwnAccount(ectx, "wrong-password")).rejects.toMatchObject({ status: 403 });
    await a.deleteOwnAccount(ectx, "editor-password");
    const data = await store.read();
    expect(data.users.map((u) => u.email)).toEqual(["o@example.com"]);
    expect(data.memberships.some((m) => m.userId === e.id)).toBe(false);
    expect(await a.login("e@example.com", "editor-password")).toBeNull();
  });
});
