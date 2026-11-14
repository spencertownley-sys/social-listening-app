/**
 * Session tokens and other checks that must run in the request proxy (no store access).
 *
 * A session cookie is `<payload>.<signature>`: payload = base64url JSON {u: userId, v: the user's
 * sessionVersion, e: expiry (ms)}, signature = HMAC-SHA256 with AUTH_SECRET. The proxy checks the
 * signature and expiry; pages and API routes then confirm the user still exists and that the
 * version matches (accounts.ts), so "sign out everywhere" and deleted users take effect at once.
 */

export const SESSION_COOKIE = "earshot_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionPayload {
  u: string;
  v: number;
  e: number;
}

const MIN_SECRET_LENGTH = 32;

/**
 * The session signing key: AUTH_SECRET only. It never falls back to APP_PASSWORD, because anyone
 * who learned the setup code could then forge sessions. In production it must be set and at least
 * 32 characters; local development uses a fixed key so no setup is needed. Exported for tests.
 */
export function sessionSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < MIN_SECRET_LENGTH) throw new Error(`Set AUTH_SECRET (at least ${MIN_SECRET_LENGTH} random characters) to sign sessions.`);
    return s;
  }
  return s || "earshot-dev-only-secret";
}

const enc = new TextEncoder();

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(s: string): string {
  return btoa(String.fromCharCode(...enc.encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(userId: string, sessionVersion: number, now = Date.now()): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ u: userId, v: sessionVersion, e: now + SESSION_MAX_AGE * 1000 } satisfies SessionPayload));
  return `${payload}.${await hmac(sessionSecret(), payload)}`;
}

export async function verifySession(token: string | undefined, now = Date.now()): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(sessionSecret(), payload))) return null;
  try {
    const p = JSON.parse(b64urlDecode(payload)) as SessionPayload;
    if (typeof p.u !== "string" || typeof p.v !== "number" || typeof p.e !== "number" || p.e < now) return null;
    return p;
  } catch {
    return null;
  }
}

/** First-account setup code: APP_PASSWORD when set (the hosted site), otherwise none needed. */
export async function checkSetupCode(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return process.env.NODE_ENV !== "production";
  // Compare digests so the comparison time doesn't depend on the code's length.
  return safeEqual(await hmac("setup", candidate), await hmac("setup", expected));
}

/** For /api/cron: `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(header: string | null): boolean {
  const s = process.env.CRON_SECRET;
  if (!s || !header) return false;
  return safeEqual(header, `Bearer ${s}`);
}
