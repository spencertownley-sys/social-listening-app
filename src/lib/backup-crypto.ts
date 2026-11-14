import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for emailed backups: AES-256-GCM with BACKUP_ENCRYPTION_KEY (32 random bytes, base64,
 * e.g. `openssl rand -base64 32`). File layout: "ESB1" | 12-byte IV | 16-byte auth tag | ciphertext.
 * scripts/decrypt-backup.mjs reverses it without the app.
 */

const MAGIC = Buffer.from("ESB1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The key, or null when BACKUP_ENCRYPTION_KEY is unset. Throws when it is set but not 32 bytes. */
export function backupKey(raw = process.env.BACKUP_ENCRYPTION_KEY): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return key;
}

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(sealed: Buffer, key: Buffer): Buffer {
  if (sealed.length < MAGIC.length + IV_BYTES + TAG_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not an encrypted Earshot backup.");
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
}
