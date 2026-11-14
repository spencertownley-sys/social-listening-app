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

/** For tests. */
export function __resetRateLimits(): void {
  for (const b of all.values()) b.clear();
}
