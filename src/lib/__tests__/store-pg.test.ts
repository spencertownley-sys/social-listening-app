import { describe, expect, it } from "vitest";
import { postgresBackend } from "../store-pg";
import { emptyData } from "../store";
import type { Post } from "../types";

// Runs only against a scratch database: TEST_DATABASE_URL=postgres://... npm test
const url = process.env.TEST_DATABASE_URL;

function post(id: string): Post {
  return {
    id,
    network: "news",
    externalId: id,
    url: `https://example.com/${id}`,
    author: { handle: "a" },
    text: `post ${id}`,
    postedAt: new Date().toISOString(),
    kind: "original",
    media: [],
    links: [],
    engagement: {},
    ingestedAt: new Date().toISOString(),
  };
}

describe.skipIf(!url)("postgres store", () => {
  it("round-trips data and writes only what changed", async () => {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url!, { onnotice: () => undefined });
    await sql`drop table if exists app_state, posts, enrichments, matches`;

    const first = postgresBackend(url!);
    const empty = await first.load();
    expect(empty.users).toEqual([]);

    const data = emptyData();
    data.users.push({ id: "u1", email: "a@b.c", name: "A", passwordHash: "x", sessionVersion: 1, createdAt: "2026-10-10T00:00:00Z" });
    data.posts = { a: post("a"), b: post("b") };
    await first.persist(data);
    delete data.posts.a;
    data.posts.c = post("c");
    await first.persist(data);

    const loaded = await postgresBackend(url!).load();
    expect(Object.keys(loaded.posts).sort()).toEqual(["b", "c"]);
    expect(loaded.users[0].email).toBe("a@b.c");
    expect(loaded.posts.b.text).toBe("post b");
    expect(loaded.workspaces).toHaveLength(1);
    await sql.end();
  });
});
