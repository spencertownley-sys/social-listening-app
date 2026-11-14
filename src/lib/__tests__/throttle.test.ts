import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-throttle-")), "store.json");
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

let store: typeof import("../store");
let pipeline: typeof import("../pipeline");
let http: typeof import("../http");
let limits: typeof import("../rate-limit");

beforeAll(async () => {
  store = await import("../store");
  pipeline = await import("../pipeline");
  http = await import("../http");
  limits = await import("../rate-limit");
});

beforeEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
  store.__resetStoreCache();
  limits.__resetRateLimits();
});

describe("paid work", () => {
  it("shares one ingest run between overlapping calls", async () => {
    const [a, b] = await Promise.all([pipeline.runIngest({ demo: true, alerts: false }), pipeline.runIngest({ demo: true, alerts: false })]);
    expect(a).toBe(b);
    expect((await store.read()).runs).toHaveLength(1);
    // Once it has finished, the next call starts a new run.
    await pipeline.runIngest({ demo: true, alerts: false });
    expect((await store.read()).runs).toHaveLength(2);
  });

  it("answers the eleventh assist call in an hour with 429", async () => {
    const ctx = { user: { id: "usr_1" } } as Parameters<typeof http.paidLimit>[1];
    for (let i = 0; i < 10; i++) expect(http.paidLimit("assist", ctx)).toBeNull();
    const res = http.paidLimit("assist", ctx);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another user has their own allowance.
    expect(http.paidLimit("assist", { user: { id: "usr_2" } } as typeof ctx)).toBeNull();
  });
});
