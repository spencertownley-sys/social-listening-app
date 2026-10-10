import { afterEach, describe, expect, it } from "vitest";
import { detectSpike, inQuietHours, runAlerts } from "../alerts";
import { feedFor } from "../analytics";
import { checkPassword, isCronAuthorized, isValidSession, sessionToken } from "../auth";
import { demoPosts } from "../connectors/demo";
import { enrichHeuristic } from "../enrich/heuristic";
import { compileProfile, matchPost } from "../matcher";
import { parseProfileConfig, type ListeningProfile, type ProfileConfigInput } from "../profile";
import type { StoreData } from "../store";

const NOW = new Date("2026-10-08T12:00:00Z");

function storeWith(input: ProfileConfigInput, createdAt = "2026-10-01T00:00:00Z"): { data: StoreData; profile: ListeningProfile } {
  const profile: ListeningProfile = {
    id: "prf_a",
    workspaceId: "ws",
    version: 1,
    status: "active",
    config: parseProfileConfig(input),
    createdAt,
    updatedAt: createdAt,
  };
  const posts = demoPosts(NOW.getTime());
  const data: StoreData = {
    workspace: { id: "ws", name: "ws" },
    profiles: [profile],
    versions: [],
    posts: Object.fromEntries(posts.map((p) => [p.id, p])),
    enrichments: Object.fromEntries(enrichHeuristic(posts).map((e) => [e.postId, e])),
    matches: {},
    feedback: [],
    learning: {},
    runs: [],
    notifications: [],
    alertState: {},
  };
  const c = compileProfile(profile);
  for (const p of posts) {
    const m = matchPost(c, p, data.enrichments[p.id]);
    if (m) data.matches[m.id] = { ...m, createdAt: NOW.toISOString() };
  }
  return { data, profile };
}

const BASE: ProfileConfigInput = { name: "Cruise", sources: { bluesky: 100, mastodon: 100 }, match: { any: ["cruise"] } };

describe("alerts", () => {
  it("bundles new matches into one realtime alert, then stays quiet", async () => {
    const { data } = storeWith({ ...BASE, delivery: { mode: "realtime" } });
    const first = await runAlerts(data, new Date(NOW.getTime() + 1000));
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe("realtime");
    expect(first[0].channels).toEqual(["in_app"]);
    expect(await runAlerts(data, new Date(NOW.getTime() + 2000))).toHaveLength(0);
  });

  it("sends a digest once per cadence", async () => {
    const { data } = storeWith({ ...BASE, delivery: { mode: "digest", cadence: "daily" } });
    expect(await runAlerts(data, NOW)).toHaveLength(1);
    expect(await runAlerts(data, new Date(NOW.getTime() + 3_600_000))).toHaveLength(0);
    expect(data.alertState.prf_a.lastDigestAt).toBe(NOW.toISOString());
  });

  it("defers during quiet hours and respects the daily cap", async () => {
    const quiet = storeWith({ ...BASE, delivery: { mode: "realtime" }, quiet_hours: { start: "11:00", end: "13:00", tz: "UTC" } });
    expect(await runAlerts(quiet.data, NOW)).toHaveLength(0);
    expect(quiet.data.alertState.prf_a?.lastRealtimeAt).toBeUndefined(); // nothing consumed

    const capped = storeWith({ ...BASE, delivery: { mode: "realtime" }, caps: { max_alerts_per_day: 1 } });
    capped.data.notifications.push({ id: "x", profileId: "prf_a", kind: "realtime", title: "", body: "", postIds: [], channels: [], createdAt: NOW.toISOString(), read: false });
    expect(await runAlerts(capped.data, NOW)).toHaveLength(0);
  });

  it("detects spikes against the 7-day hourly baseline", () => {
    const { data } = storeWith(BASE);
    const items = feedFor(data, "prf_a");
    const burst = Array.from({ length: 6 }, (_, i) => ({
      ...items[0],
      post: { ...items[0].post, postedAt: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString() },
    }));
    expect(detectSpike(burst, 3, NOW.getTime())).toMatchObject({ current: 6 });
    expect(detectSpike(burst.slice(0, 3), 3, NOW.getTime())).toBeNull();
  });

  it("handles quiet hours that wrap past midnight", () => {
    const q = { start: "22:00", end: "07:00", tz: "UTC" };
    expect(inQuietHours(q, new Date("2026-10-08T23:30:00Z"))).toBe(true);
    expect(inQuietHours(q, new Date("2026-10-08T06:59:00Z"))).toBe(true);
    expect(inQuietHours(q, new Date("2026-10-08T12:00:00Z"))).toBe(false);
  });
});

describe("heuristic draft", () => {
  it("reads 'complaints' as a request for negative posts", async () => {
    const { heuristicDraft } = await import("../assist");
    expect(heuristicDraft("cruise ship wifi complaints").sentiment_keep).toEqual(["negative", "mixed"]);
  });
});

describe("auth", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is open when no password is configured", async () => {
    delete process.env.APP_PASSWORD;
    expect(await isValidSession(undefined)).toBe(true);
  });

  it("checks the password and the session cookie", async () => {
    process.env.APP_PASSWORD = "correct horse";
    expect(await checkPassword("correct horse")).toBe(true);
    expect(await checkPassword("wrong")).toBe(false);
    const token = await sessionToken();
    expect(await isValidSession(token)).toBe(true);
    expect(await isValidSession("forged")).toBe(false);
    expect(await isValidSession(undefined)).toBe(false);
    process.env.AUTH_SECRET = "rotated";
    expect(await isValidSession(token)).toBe(false);
  });

  it("requires the exact cron bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized("Bearer s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer nope")).toBe(false);
    expect(isCronAuthorized(null)).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized("Bearer ")).toBe(false);
  });
});
