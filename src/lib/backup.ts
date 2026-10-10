import { promises as fs } from "fs";
import path from "path";
import { gzipSync } from "zlib";
import { sendEmail } from "./digest";
import type { Context } from "./accounts";
import { DATA_FILE, DEFAULT_WORKSPACE_ID, read, type StoreData } from "./store";

/**
 * Nightly backups, for hosts without database backups (Railway's Hobby plan).
 *
 * Each backup is the whole dataset as gzipped JSON. It is saved on the server (BACKUP_DIR,
 * default next to the data file, so /data/backups on Railway; the newest BACKUP_KEEP are kept)
 * and emailed through Resend to BACKUP_TO, or to the workspace owners. To restore, point
 * EARSHOT_DATA_FILE at a backup file and start against an empty database: it is imported on the
 * first start like any data file.
 */

export const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(path.dirname(DATA_FILE), "backups");
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 7));
const HOUR_UTC = Number(process.env.BACKUP_HOUR_UTC ?? 8);
// Resend accepts up to 40 MB per email after base64 encoding.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const NAME = /^earshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json\.gz$/;

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

export interface BackupResult {
  file: BackupFile;
  emailed: boolean;
  emailNote?: string;
}

export interface BackupStatus {
  lastRunAt?: string;
  lastResult?: BackupResult;
  lastError?: string;
}

const g = globalThis as typeof globalThis & { __earshotBackup?: BackupStatus & { running?: Promise<BackupResult> } };
const status = (g.__earshotBackup ??= {});

export function backupStatus(): BackupStatus {
  return { lastRunAt: status.lastRunAt, lastResult: status.lastResult, lastError: status.lastError };
}

export function isBackupName(name: string): boolean {
  return NAME.test(name);
}

export function backupPath(name: string): string {
  if (!isBackupName(name)) throw new Error("Not a backup file name.");
  return path.join(BACKUP_DIR, name);
}

export async function listBackups(): Promise<BackupFile[]> {
  let names: string[];
  try {
    names = await fs.readdir(BACKUP_DIR);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const files = await Promise.all(
    names.filter(isBackupName).map(async (name) => {
      const st = await fs.stat(path.join(BACKUP_DIR, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

/** Backups hold every workspace, so only owners of the site's main workspace see them. */
export function canManageBackups(ctx: Context): boolean {
  return ctx.memberships.some((m) => m.workspaceId === DEFAULT_WORKSPACE_ID && m.role === "owner");
}

/** Who gets the backup email: BACKUP_TO, otherwise the owners of the main workspace. */
export function backupRecipients(data: StoreData): string[] {
  const configured = (process.env.BACKUP_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  const owners = new Set(data.memberships.filter((m) => m.workspaceId === DEFAULT_WORKSPACE_ID && m.role === "owner").map((m) => m.userId));
  return data.users.filter((u) => owners.has(u.id)).map((u) => u.email);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function create(now: Date): Promise<BackupResult> {
  const data = await read();
  const gz = gzipSync(JSON.stringify(data));
  const name = `earshot-${now.toISOString().slice(0, 16).replace(":", "-")}.json.gz`;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const tmp = path.join(BACKUP_DIR, `${name}.tmp`);
  await fs.writeFile(tmp, gz);
  await fs.rename(tmp, path.join(BACKUP_DIR, name));
  for (const old of (await listBackups()).slice(KEEP)) await fs.rm(path.join(BACKUP_DIR, old.name), { force: true });
  const file: BackupFile = { name, size: gz.length, createdAt: now.toISOString() };

  const posts = Object.keys(data.posts).length;
  const summary = `${data.profiles.length} profiles, ${posts} posts, ${Object.keys(data.matches).length} matches, ${data.users.length} users`;
  const restore = "To restore, send this file to whoever runs Earshot (it can be imported into an empty database as-is).";
  const tooBig = gz.length > MAX_ATTACHMENT_BYTES;
  const text = [
    `Earshot backup from ${now.toUTCString()}: ${summary}, ${formatBytes(gz.length)} compressed.`,
    tooBig ? "The file is too large to attach. Download it from the Account page." : "The backup is attached.",
    restore,
    "It contains your account list (with hashed passwords), so keep it somewhere private.",
  ].join("\n\n");
  const email = await sendEmail(
    `Earshot backup ${now.toISOString().slice(0, 10)}`,
    text
      .split("\n\n")
      .map((p) => `<p style="font-family:system-ui">${p}</p>`)
      .join(""),
    text,
    {
      to: backupRecipients(data),
      attachments: tooBig ? [] : [{ filename: name, content: gz.toString("base64") }],
    },
  );
  return { file, emailed: email.sent, emailNote: email.reason };
}

/** Make a backup now (never two at once). */
export function runBackup(now = new Date()): Promise<BackupResult> {
  status.running ??= create(now)
    .then((r) => {
      status.lastResult = r;
      status.lastError = undefined;
      console.log(`[backup] saved ${r.file.name} (${formatBytes(r.file.size)}), ${r.emailed ? "emailed" : `not emailed: ${r.emailNote}`}`);
      return r;
    })
    .catch((e: Error) => {
      status.lastError = e.message;
      console.error("[backup] failed:", e);
      throw e;
    })
    .finally(() => {
      status.lastRunAt = now.toISOString();
      status.running = undefined;
    });
  return status.running;
}

/** Due at BACKUP_HOUR_UTC once a day, or straight away if a day and a half has passed without one. */
export function backupDue(now: Date, last: Date | undefined): boolean {
  if (!last) return true;
  const age = now.getTime() - last.getTime();
  if (age < 23 * 3_600_000) return false;
  return now.getUTCHours() === HOUR_UTC || age > 36 * 3_600_000;
}

/** Called from the scheduler every few minutes. */
export async function maybeBackup(now = new Date()): Promise<void> {
  if (process.env.BACKUPS === "off" || status.running) return;
  const newest = (await listBackups())[0];
  if (!backupDue(now, newest ? new Date(newest.createdAt) : undefined)) return;
  await runBackup(now).catch(() => undefined);
}
