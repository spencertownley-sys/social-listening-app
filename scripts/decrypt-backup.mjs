#!/usr/bin/env node
// Decrypt an emailed Earshot backup (.json.gz.enc) into a .json.gz file that Earshot can import.
// Usage: BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs earshot-2026-11-14T08-00.json.gz.enc
// Format (see src/lib/backup-crypto.ts): "ESB1" | 12-byte IV | 16-byte GCM tag | ciphertext.
import { createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [input] = process.argv.slice(2);
const key = Buffer.from((process.env.BACKUP_ENCRYPTION_KEY ?? "").trim(), "base64");
if (!input || key.length !== 32) {
  console.error("Usage: BACKUP_ENCRYPTION_KEY=<32-byte base64 key> node scripts/decrypt-backup.mjs <file.json.gz.enc>");
  process.exit(1);
}
const sealed = readFileSync(input);
if (sealed.subarray(0, 4).toString() !== "ESB1") {
  console.error("Not an encrypted Earshot backup.");
  process.exit(1);
}
const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(4, 16));
decipher.setAuthTag(sealed.subarray(16, 32));
let plain;
try {
  plain = Buffer.concat([decipher.update(sealed.subarray(32)), decipher.final()]);
} catch {
  console.error("Could not decrypt: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.");
  process.exit(1);
}
const output = input.replace(/\.enc$/, "") === input ? `${input}.json.gz` : input.replace(/\.enc$/, "");
writeFileSync(output, plain);
console.log(`Wrote ${output}`);
