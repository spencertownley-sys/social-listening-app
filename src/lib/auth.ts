/**
 * Single-workspace access gate for hosted deployments. When APP_PASSWORD is set, every page and
 * API route needs a session cookie, issued by /login. The cookie holds an HMAC of a fixed label
 * keyed by AUTH_SECRET (or the password itself), so changing either one signs everyone out.
 * Without APP_PASSWORD (local dev) the gate is off. Supabase Auth replaces this with real
 * accounts later (docs/BUILD_PLAN.md).
 */

export const SESSION_COOKIE = "earshot_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

async function hmac(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

export async function sessionToken(): Promise<string> {
  return hmac(secret(), "earshot-session-v1");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!token) return false;
  return safeEqual(token, await sessionToken());
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD ?? "";
  // Compare digests so the comparison time doesn't depend on the password's length.
  return safeEqual(await hmac("pw", candidate), await hmac("pw", expected));
}

/** For /api/cron: `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(header: string | null): boolean {
  const s = process.env.CRON_SECRET;
  if (!s || !header) return false;
  return safeEqual(header, `Bearer ${s}`);
}
