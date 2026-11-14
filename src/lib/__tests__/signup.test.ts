import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Watch scrypt (the expensive password hash) without changing what it does.
const scryptCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  const scrypt = ((...args: Parameters<typeof real.scrypt>) => {
    scryptCalls.count++;
    return (real.scrypt as (...a: unknown[]) => void)(...args);
  }) as typeof real.scrypt;
  return { ...real, default: { ...real, scrypt }, scrypt };
});

process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-signup-")), "store.json");
delete process.env.DATABASE_URL;

let a: typeof import("../accounts");
let store: typeof import("../store");
let limits: typeof import("../rate-limit");
let signupRoute: typeof import("../../app/api/signup/route");

beforeAll(async () => {
  store = await import("../store");
  a = await import("../accounts");
  limits = await import("../rate-limit");
  signupRoute = await import("../../app/api/signup/route");
});

beforeEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
  store.__resetStoreCache();
  limits.__resetRateLimits();
  process.env.APP_PASSWORD = "setup-code";
});

function signupForm(token: string, email: string, ip = "203.0.113.20"): Request {
  return new Request("http://localhost/api/signup", {
    method: "POST",
    body: new URLSearchParams({ invite: token, email, name: "New person", password: "new-password-1" }),
    headers: { "x-forwarded-for": ip },
  });
}

describe("sign-up with an invite", () => {
  it("rejects a made-up invite with 410 without hashing the password", async () => {
    scryptCalls.count = 0;
    await expect(a.signupWithInvite({ token: "random-token", email: "x@example.com", name: "X", password: "x-password-1" })).rejects.toMatchObject({
      status: 410,
    });
    expect(scryptCalls.count).toBe(0);
    const res = await signupRoute.POST(signupForm("random-token", "x@example.com"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/error=This%20invite%20link%20has%20expired/);
    expect(scryptCalls.count).toBe(0);
  });

  it("still hashes for a real invite", async () => {
    const owner = await a.setupFirstAccount({ setupCode: "setup-code", email: "o@example.com", name: "O", password: "owner-password" });
    const { token } = await a.createInvite(a.contextFor(await store.read(), owner.id)!, "editor");
    scryptCalls.count = 0;
    const user = await a.signupWithInvite({ token, email: "e@example.com", name: "E", password: "editor-password" });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(scryptCalls.count).toBe(1);
  });

  it("refuses an eleventh attempt from one address", async () => {
    const locations: string[] = [];
    for (let i = 0; i < 11; i++) locations.push((await signupRoute.POST(signupForm("nope", `p${i}@example.com`))).headers.get("location") ?? "");
    expect(locations.slice(0, 10).every((l) => l.includes("invite%20link"))).toBe(true);
    expect(locations[10]).toMatch(/Too%20many%20attempts/);
  });
});
