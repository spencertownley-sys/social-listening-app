import { mkdtempSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "earshot-backup-"));
process.env.EARSHOT_DATA_FILE = path.join(dir, "store.json");
process.env.BACKUP_KEEP = "2";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

let b: typeof import("../backup");
let store: typeof import("../store");

beforeAll(async () => {
  store = await import("../store");
  b = await import("../backup");
});

beforeEach(async () => {
  await rm(dir, { recursive: true, force: true });
  store.__resetStoreCache();
});

describe("backups", () => {
  it("is due once a day at the backup hour, or after 36 hours regardless", () => {
    const at = (iso: string) => new Date(iso);
    expect(b.backupDue(at("2026-10-10T03:00:00Z"), undefined)).toBe(true);
    expect(b.backupDue(at("2026-10-10T08:05:00Z"), at("2026-10-09T08:00:00Z"))).toBe(true);
    expect(b.backupDue(at("2026-10-10T09:00:00Z"), at("2026-10-10T08:00:00Z"))).toBe(false);
    expect(b.backupDue(at("2026-10-10T12:00:00Z"), at("2026-10-09T08:00:00Z"))).toBe(false);
    expect(b.backupDue(at("2026-10-10T21:00:00Z"), at("2026-10-09T08:00:00Z"))).toBe(true);
  });

  it("saves the whole dataset, keeps the newest copies, and reports why it wasn't emailed", async () => {
    await store.mutate((d) => {
      d.users.push({ id: "u1", email: "owner@example.com", name: "O", passwordHash: "x", sessionVersion: 1, createdAt: "" });
      d.memberships.push({ workspaceId: store.DEFAULT_WORKSPACE_ID, userId: "u1", role: "owner" });
    });
    const first = await b.runBackup(new Date("2026-10-08T08:00:00Z"));
    await b.runBackup(new Date("2026-10-09T08:00:00Z"));
    const last = await b.runBackup(new Date("2026-10-10T08:00:00Z"));
    expect(last.emailed).toBe(false);
    expect(last.emailNote).toMatch(/RESEND_API_KEY/);
    const names = (await b.listBackups()).map((f) => f.name);
    expect(names).toEqual(["earshot-2026-10-10T08-00.json.gz", "earshot-2026-10-09T08-00.json.gz"]);
    expect(names).not.toContain(first.file.name);
    expect((await readdir(b.BACKUP_DIR)).some((n) => n.endsWith(".tmp"))).toBe(false);
    const restored = JSON.parse(gunzipSync(await readFile(b.backupPath(last.file.name))).toString());
    expect(restored.users[0].email).toBe("owner@example.com");
    expect(b.backupRecipients(restored)).toEqual(["owner@example.com"]);
  });

  it("only accepts its own file names", () => {
    expect(b.isBackupName("earshot-2026-10-10T08-00.json.gz")).toBe(true);
    expect(b.isBackupName("../earshot.json")).toBe(false);
    expect(() => b.backupPath("../../etc/passwd")).toThrow();
  });
});
