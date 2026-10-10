import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// The store reads EARSHOT_DATA_FILE when it loads, so point it at a temp file first.
process.env.EARSHOT_DATA_FILE = path.join(mkdtempSync(path.join(tmpdir(), "earshot-")), "store.json");
delete process.env.DATABASE_URL;

type Accounts = typeof import("../accounts");
type Store = typeof import("../store");
let a: Accounts;
let store: Store;

beforeAll(async () => {
  store = await import("../store");
  a = await import("../accounts");
});

beforeEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(process.env.EARSHOT_DATA_FILE!, { force: true });
  store.__resetStoreCache();
  process.env.APP_PASSWORD = "setup-code";
  process.env.AUTH_SECRET = "test-secret";
});

const owner = { setupCode: "setup-code", email: "Owner@Example.com ", name: "Owner", password: "owner-password" };

async function ctxOf(userId: string) {
  return a.contextFor(await store.read(), userId)!;
}

describe("accounts", () => {
  it("sets up the first account once, with the setup code", async () => {
    expect(await a.needsSetup()).toBe(true);
    await expect(a.setupFirstAccount({ ...owner, setupCode: "wrong" })).rejects.toMatchObject({ status: 403 });
    await expect(a.setupFirstAccount({ ...owner, password: "short" })).rejects.toThrow(/10 characters/);
    const user = await a.setupFirstAccount(owner);
    expect(user.email).toBe("owner@example.com");
    expect(user.passwordHash).not.toContain("owner-password");
    const ctx = await ctxOf(user.id);
    expect(ctx).toMatchObject({ role: "owner", workspaceId: store.DEFAULT_WORKSPACE_ID });
    await expect(a.setupFirstAccount({ ...owner, email: "two@example.com" })).rejects.toMatchObject({ status: 409 });
  });

  it("logs in with the right password only", async () => {
    await a.setupFirstAccount(owner);
    expect(await a.login("OWNER@example.com", "owner-password")).not.toBeNull();
    expect(await a.login("owner@example.com", "wrong-password")).toBeNull();
    expect(await a.login("nobody@example.com", "owner-password")).toBeNull();
  });

  it("invites people into the workspace with a role, once", async () => {
    const o = await a.setupFirstAccount(owner);
    const { token } = await a.createInvite(await ctxOf(o.id), "viewer");
    const viewer = await a.signupWithInvite({ token, email: "v@example.com", name: "Viewer", password: "viewer-password" });
    const vctx = await ctxOf(viewer.id);
    expect(vctx.role).toBe("viewer");
    expect(a.canWrite(vctx)).toBe(false);
    await expect(a.signupWithInvite({ token, email: "w@example.com", name: "W", password: "another-password" })).rejects.toMatchObject({ status: 410 });
    await expect(a.createInvite(vctx, "editor")).rejects.toMatchObject({ status: 403 });
    expect(a.openInvites(await store.read(), await ctxOf(o.id))).toHaveLength(0);
  });

  it("keeps editors from inviting owners and from removing people", async () => {
    const o = await a.setupFirstAccount(owner);
    const { token } = await a.createInvite(await ctxOf(o.id), "editor");
    const editor = await a.signupWithInvite({ token, email: "e@example.com", name: "Editor", password: "editor-password" });
    const ectx = await ctxOf(editor.id);
    await expect(a.createInvite(ectx, "owner")).rejects.toMatchObject({ status: 403 });
    await expect(a.removeMember(ectx, o.id)).rejects.toMatchObject({ status: 403 });
    await a.removeMember(await ctxOf(o.id), editor.id);
    expect(await a.login("e@example.com", "editor-password")).toBeNull();
  });

  it("only shows profiles from the user's workspaces", async () => {
    const o = await a.setupFirstAccount(owner);
    const data = await store.read();
    data.profiles.push({ id: "p1", workspaceId: store.DEFAULT_WORKSPACE_ID } as never, { id: "p2", workspaceId: "ws_other" } as never);
    const ctx = await ctxOf(o.id);
    expect(a.visibleProfiles(data, ctx).map((p) => p.id)).toEqual(["p1"]);
    expect(a.canSeeProfile(data, ctx, "p2")).toBe(false);
  });

  it("invalidates old sessions after a password change", async () => {
    const o = await a.setupFirstAccount(owner);
    const ctx = await ctxOf(o.id);
    await expect(a.changePassword(ctx, "wrong-password", "new-password-1")).rejects.toMatchObject({ status: 403 });
    const updated = await a.changePassword(ctx, "owner-password", "new-password-1");
    expect(a.contextFor(await store.read(), o.id, 1)).toBeNull();
    expect(a.contextFor(await store.read(), o.id, updated.sessionVersion)).not.toBeNull();
    expect(await a.login("owner@example.com", "new-password-1")).not.toBeNull();
  });
});

describe("store migration", () => {
  it("turns the old single workspace into the workspaces list", () => {
    const data = store.normalize({ workspace: { id: "ws_local", name: "Cruise team" } } as never);
    expect(data.workspaces).toEqual([expect.objectContaining({ id: "ws_local", name: "Cruise team" })]);
    expect(data.users).toEqual([]);
    expect("workspace" in data).toBe(false);
  });
});
