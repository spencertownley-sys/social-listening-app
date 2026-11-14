import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Route handlers read the session cookie through next/headers; serve it from this jar.
const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.token ? { name, value: jar.token } : undefined) }),
}));

// The store reads EARSHOT_DATA_FILE when it loads, so point it at a temp file first.
process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-routes-")), "store.json");
delete process.env.DATABASE_URL;

let store: typeof import("../store");
let limits: typeof import("../rate-limit");
let setupRoute: typeof import("../../app/api/setup/route");
let loginRoute: typeof import("../../app/api/login/route");
let logoutRoute: typeof import("../../app/api/logout/route");
let accounts: typeof import("../accounts");

beforeAll(async () => {
  store = await import("../store");
  limits = await import("../rate-limit");
  setupRoute = await import("../../app/api/setup/route");
  loginRoute = await import("../../app/api/login/route");
  logoutRoute = await import("../../app/api/logout/route");
  accounts = await import("../accounts");
});

beforeEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
  store.__resetStoreCache();
  limits.__resetRateLimits();
  jar.token = undefined;
  process.env.APP_PASSWORD = "setup-code";
  process.env.AUTH_SECRET = "test-secret-that-is-long-enough-1234";
});

function form(url: string, fields: Record<string, string>, ip = "203.0.113.7"): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

const setupFields = { setupCode: "wrong-code", email: "owner@example.com", name: "Owner", password: "owner-password" };

describe("POST /api/setup", () => {
  it("answers 429 after five attempts from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await setupRoute.POST(form("/api/setup", setupFields))).status);
    expect(statuses.slice(0, 5).every((s) => s === 303)).toBe(true);
    expect(statuses[5]).toBe(429);
    // Another address is not affected.
    expect((await setupRoute.POST(form("/api/setup", setupFields, "198.51.100.9"))).status).toBe(303);
  });

  it("stops answering once the site has an account", async () => {
    const ok = await setupRoute.POST(form("/api/setup", { ...setupFields, setupCode: "setup-code" }));
    expect(ok.headers.get("location")).toBe("/");
    const again = await setupRoute.POST(form("/api/setup", { ...setupFields, email: "two@example.com" }));
    expect(again.status).toBe(303);
    expect(again.headers.get("location")).toBe("/login");
  });
});

describe("POST /api/login", () => {
  it("refuses the eleventh failed attempt from one address before checking the password", async () => {
    await setupRoute.POST(form("/api/setup", { ...setupFields, setupCode: "setup-code" }, "192.0.2.1"));
    const locations: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await loginRoute.POST(form("/api/login", { email: `guess${i}@example.com`, password: "wrong-password", next: "/" }));
      locations.push(res.headers.get("location") ?? "");
    }
    expect(locations.every((l) => l.startsWith("/login?error=1"))).toBe(true);
    // Even the right password is refused once the address is over the limit.
    const started = Date.now();
    const blocked = await loginRoute.POST(form("/api/login", { email: "owner@example.com", password: "owner-password", next: "/" }));
    expect(blocked.headers.get("location")).toMatch(/^\/login\?error=limit/);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  }, 60_000);

  it("limits guesses at one email address across many addresses", () => {
    const req = (ip: string) => new Request("http://localhost/api/login", { method: "POST", headers: { "x-forwarded-for": ip } });
    const results = Array.from({ length: 11 }, (_, i) => limits.allowAuthAttempt("login", req(`198.51.100.${i}`), " Owner@Example.com"));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
  });
});

describe("POST /api/logout", () => {
  it("ends the session on the server, so the old cookie stops working", async () => {
    const res = await setupRoute.POST(form("/api/setup", { ...setupFields, setupCode: "setup-code" }, "192.0.2.2"));
    jar.token = res.cookies.get("earshot_session")?.value;
    expect(jar.token).toBeTruthy();
    expect(await accounts.currentContext()).not.toBeNull();
    const out = await logoutRoute.POST();
    expect(out.headers.get("location")).toBe("/login");
    // The browser drops the cookie, but a copy of it must be useless too.
    expect(await accounts.currentContext()).toBeNull();
  });
});

describe("password hashes", () => {
  it("still accepts hashes made with the old, cheaper scrypt cost", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.from("0123456789abcdef");
    const old = `scrypt$16384$${salt.toString("base64url")}$${scryptSync("old-password", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
    expect(await accounts.verifyPassword("old-password", old)).toBe(true);
    expect(await accounts.verifyPassword("wrong-password", old)).toBe(false);
    expect(await accounts.hashPassword("new-password")).toMatch(/^scrypt\$131072\$/);
    expect(await accounts.verifyPassword("x", "scrypt$1000$AAAA$AAAA")).toBe(false);
  });

  it("makes ids with a random part that isn't Math.random", async () => {
    const ids = new Set(Array.from({ length: 1000 }, () => store.newId("usr")));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^usr_[0-9a-z]+[0-9a-f]{12}$/);
  });
});
