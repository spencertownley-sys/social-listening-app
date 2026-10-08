import { describe, expect, it } from "vitest";
import { bskyToPost } from "../connectors/bluesky";
import { mastodonToPost, termToHashtag } from "../connectors/mastodon";
import { itemToPost, parseFeed } from "../connectors/rss";

describe("RSS / Atom parsing", () => {
  it("reads RSS items", () => {
    const xml = `<rss><channel><item><title><![CDATA[Ship &amp; shore]]></title><link>https://ex.com/a</link>
      <pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
      <dc:creator>Ann</dc:creator></item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item).toMatchObject({ title: "Ship & shore", link: "https://ex.com/a", body: "Hello world", author: "Ann" });
    const post = itemToPost(item, "https://ex.com/feed")!;
    expect(post.network).toBe("news");
    expect(post.postedAt).toBe("2026-10-06T10:00:00.000Z");
  });

  it("reads Atom entries", () => {
    const xml = `<feed><entry><title>Hi</title><link href="https://ex.com/b"/><id>tag:1</id><updated>2026-10-07T00:00:00Z</updated><summary>Body</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ title: "Hi", link: "https://ex.com/b", body: "Body", guid: "tag:1" });
  });
});

describe("Bluesky mapping", () => {
  it("builds a web URL, links and reply kind", () => {
    const p = bskyToPost({
      uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
      cid: "c",
      author: { did: "did:plc:abc", handle: "a.bsky.social" },
      record: { text: "hi", createdAt: "2026-10-07T00:00:00Z", langs: ["en"], reply: {}, facets: [{ features: [{ $type: "link", uri: "https://x.y" }] }] },
      likeCount: 3,
      indexedAt: "2026-10-07T00:00:01Z",
    });
    expect(p.url).toBe("https://bsky.app/profile/a.bsky.social/post/3kxyz");
    expect(p.kind).toBe("reply");
    expect(p.links).toEqual(["https://x.y"]);
  });
});

describe("Mastodon mapping", () => {
  it("strips HTML, flags bots and skips tag links", () => {
    const p = mastodonToPost(
      {
        id: "1",
        url: "https://m.s/@a/1",
        uri: "https://m.s/users/a/statuses/1",
        created_at: "2026-10-07T00:00:00Z",
        content: '<p>Hello <a href="https://m.s/tags/cruise">#cruise</a> <a href="https://news.ex/x">link</a></p>',
        language: "en",
        in_reply_to_id: null,
        reblog: null,
        replies_count: 0,
        reblogs_count: 1,
        favourites_count: 2,
        media_attachments: [],
        account: { acct: "a", display_name: "A", followers_count: 10, bot: true, created_at: "2020-01-01T00:00:00Z" },
      },
      "m.s",
    );
    expect(p.text).toBe("Hello #cruise link");
    expect(p.links).toEqual(["https://news.ex/x"]);
    expect(p.author.handle).toBe("a@m.s");
    expect(p.author.botScore).toBeGreaterThan(0.9);
  });

  it("derives hashtags from single-word terms", () => {
    expect(termToHashtag("#CruiseLife")).toBe("cruiselife");
    expect(termToHashtag('"royal caribbean"')).toBe("royalcaribbean");
    expect(termToHashtag("a")).toBeNull();
  });
});
