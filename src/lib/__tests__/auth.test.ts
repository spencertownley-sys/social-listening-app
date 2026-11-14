import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionSecret, signSession, verifySession } from "../auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session signing key", () => {
  it("ignores APP_PASSWORD", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("APP_PASSWORD", "the-setup-code");
    expect(sessionSecret()).not.toBe("the-setup-code");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => sessionSecret()).toThrow(/Set AUTH_SECRET/);
  });

  it("needs a long AUTH_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "too-short");
    expect(() => sessionSecret()).toThrow(/Set AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    expect(sessionSecret()).toBe("x".repeat(32));
  });

  it("does not accept a session signed with the setup code", async () => {
    vi.stubEnv("AUTH_SECRET", "a-real-secret-of-at-least-32-characters");
    vi.stubEnv("APP_PASSWORD", "the-setup-code");
    const token = await signSession("usr_1", 1);
    expect(await verifySession(token)).toMatchObject({ u: "usr_1", v: 1 });
    vi.stubEnv("AUTH_SECRET", "the-setup-code");
    const forged = await signSession("usr_1", 1);
    vi.stubEnv("AUTH_SECRET", "a-real-secret-of-at-least-32-characters");
    expect(await verifySession(forged)).toBeNull();
  });
});
