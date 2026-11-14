/**
 * Small in-memory rate limiter (one server process, as on Railway). Each limiter counts hits per
 * key in a fixed window; once a key reaches `max`, further hits are refused until the window
 * ends. Used for the sign-in, setup and sign-up forms and for routes that call paid APIs.
 *
 * Counters live on globalThis because Next.js gives pages and route handlers separate module
 * instances; a restart clears them, which is fine for throttling.
 */

export interface LimitResult {
  ok: boolean;
  /** Seconds until the key's window ends (for Retry-After). */
  retryAfter: number;
}

export interface Limiter {
  hit(key: string, now?: number): LimitResult;
  reset(key: string): void;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as typeof globalThis & { __earshotRateLimits?: Map<string, Map<string, Bucket>> };
const all = (g.__earshotRateLimits ??= new Map());
const MAX_KEYS = 10_000;

export function rateLimiter(name: string, opts: { max: number; windowMs: number }): Limiter {
  let buckets = all.get(name);
  if (!buckets) {
    buckets = new Map<string, Bucket>();
    all.set(name, buckets);
  }
  const b = buckets;
  return {
    hit(key, now = Date.now()) {
      let bucket = b.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (b.size >= MAX_KEYS) for (const [k, v] of b) if (v.resetAt <= now) b.delete(k);
        // Still full of live keys: drop the oldest so memory stays bounded.
        if (b.size >= MAX_KEYS) b.delete(b.keys().next().value!);
        bucket = { count: 0, resetAt: now + opts.windowMs };
        b.set(key, bucket);
      }
      bucket.count++;
      return { ok: bucket.count <= opts.max, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    },
    reset(key) {
      b.delete(key);
    },
  };
}

/** The client's address: the first X-Forwarded-For entry (set by Railway's proxy), else X-Real-IP. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

const MINUTES_15 = 15 * 60_000;

/** POST /api/setup: 5 attempts per 15 minutes per address. */
export const setupLimiter = rateLimiter("setup", { max: 5, windowMs: MINUTES_15 });

const loginByIp = rateLimiter("login-ip", { max: 10, windowMs: MINUTES_15 });
const loginByEmail = rateLimiter("login-email", { max: 10, windowMs: MINUTES_15 });
const signupByIp = rateLimiter("signup-ip", { max: 10, windowMs: MINUTES_15 });
const signupByEmail = rateLimiter("signup-email", { max: 10, windowMs: MINUTES_15 });

/**
 * Sign-in and sign-up forms: 10 attempts per 15 minutes per address and per email address. Both
 * counters are bumped on every attempt, so spreading guesses over many emails or many addresses
 * still hits one of them.
 */
export function allowAuthAttempt(form: "login" | "signup", req: Request, email: string, now = Date.now()): boolean {
  const [byIp, byEmail] = form === "login" ? [loginByIp, loginByEmail] : [signupByIp, signupByEmail];
  const ip = byIp.hit(clientIp(req), now);
  const mail = byEmail.hit(email.trim().toLowerCase(), now);
  return ip.ok && mail.ok;
}

const HOUR = 60 * 60_000;

/**
 * Routes that spend money on paid APIs (X, Claude), counted per signed-in user per hour. Preview
 * gets more room because tuning a profile means previewing it again and again, and it only labels
 * posts that have no labels yet.
 */
export const paidLimits = {
  ingest: rateLimiter("paid-ingest", { max: 10, windowMs: HOUR }),
  assist: rateLimiter("paid-assist", { max: 10, windowMs: HOUR }),
  preview: rateLimiter("paid-preview", { max: 30, windowMs: HOUR }),
  digest: rateLimiter("paid-digest", { max: 10, windowMs: HOUR }),
};

/** For tests. */
export function __resetRateLimits(): void {
  for (const b of all.values()) b.clear();
}
