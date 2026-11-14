import { mkdtempSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "earshot-backup-"));
process.env.EARSHOT_DATA_FILE = path.join(dir, "store.json");
process.env.BACKUP_KEEP = "2";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

let b: typeof import("../backup");
let crypt: typeof import("../backup-crypto");
let store: typeof import("../store");

beforeAll(async () => {
  store = await import("../store");
  b = await import("../backup");
  crypt = await import("../backup-crypto");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Capture what would be sent to Resend. */
function captureEmails() {
  const sent: { to: string[]; text: string; attachments?: { filename: string; content: string }[] }[] = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }),
  );
  return sent;
}

async function addOwner() {
  await store.mutate((d) => {
    d.users.push({ id: "u1", email: "owner@example.com", name: "O", passwordHash: "scrypt$16384$c2FsdA$aGFzaA", sessionVersion: 1, createdAt: "" });
    d.memberships.push({ workspaceId: store.DEFAULT_WORKSPACE_ID, userId: "u1", role: "owner" });
  });
}

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

  it("round-trips the encryption and rejects the wrong key", () => {
    const key = randomBytes(32);
    const sealed = crypt.encryptBackup(Buffer.from("hello"), key);
    expect(sealed.includes(Buffer.from("hello"))).toBe(false);
    expect(crypt.decryptBackup(sealed, key).toString()).toBe("hello");
    expect(() => crypt.decryptBackup(sealed, randomBytes(32))).toThrow();
    expect(() => crypt.backupKey("c2hvcnQ=")).toThrow(/32 bytes/);
    expect(crypt.backupKey(undefined)).toBeNull();
  });

  it("emails an encrypted copy without password hashes when a key is set", async () => {
    const key = randomBytes(32);
    vi.stubEnv("BACKUP_ENCRYPTION_KEY", key.toString("base64"));
    const sent = captureEmails();
    await addOwner();
    const r = await b.runBackup(new Date("2026-10-11T08:00:00Z"));
    expect(r).toMatchObject({ emailed: true, attached: true });
    expect(sent).toHaveLength(1);
    const att = sent[0].attachments![0];
    expect(att.filename).toBe("earshot-2026-10-11T08-00.json.gz.enc");
    const sealed = Buffer.from(att.content, "base64");
    expect(() => gunzipSync(sealed)).toThrow();
    const restored = JSON.parse(gunzipSync(crypt.decryptBackup(sealed, key)).toString());
    expect(restored.users[0]).toMatchObject({ email: "owner@example.com", passwordHash: "" });
    expect(JSON.stringify(restored)).not.toContain("scrypt$");
    // The copy kept on the server is the full dataset, so a normal restore keeps everyone's password.
    const onDisk = JSON.parse(gunzipSync(await readFile(b.backupPath(r.file.name))).toString());
    expect(onDisk.users[0].passwordHash).toMatch(/^scrypt\$/);
  });

  it("sends only a notice when there is no encryption key", async () => {
    const sent = captureEmails();
    await addOwner();
    const r = await b.runBackup(new Date("2026-10-12T08:00:00Z"));
    expect(r).toMatchObject({ emailed: true, attached: false });
    expect(sent[0].attachments).toBeUndefined();
    expect(sent[0].text).toMatch(/BACKUP_ENCRYPTION_KEY is not set/);
  });

  it("only accepts its own file names", () => {
    expect(b.isBackupName("earshot-2026-10-10T08-00.json.gz")).toBe(true);
    expect(b.isBackupName("../earshot.json")).toBe(false);
    expect(() => b.backupPath("../../etc/passwd")).toThrow();
  });
});
