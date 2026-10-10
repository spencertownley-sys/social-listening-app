import { runIngest } from "./pipeline";

/**
 * In-process schedule for a long-running server (Railway): listen for every active profile every
 * INGEST_INTERVAL_MINUTES (default 60), then send whatever alerts and digests are due.
 * `/api/cron` runs the same cycle on demand for hosts that prefer an external scheduler.
 */

const g = globalThis as typeof globalThis & { __earshotScheduler?: NodeJS.Timeout; __earshotCycle?: Promise<unknown> };

export async function runCycle(): Promise<unknown> {
  // Never overlap two cycles.
  if (g.__earshotCycle) return g.__earshotCycle;
  g.__earshotCycle = runIngest({ sinceHours: 24 })
    .then((run) => {
      console.log(`[scheduler] ${run.fetched} fetched, ${run.newPosts} new, ${run.matches} matches, ${run.alerts ?? 0} alerts`);
      return run;
    })
    .catch((e) => console.error("[scheduler] cycle failed:", e))
    .finally(() => {
      g.__earshotCycle = undefined;
    });
  return g.__earshotCycle;
}

export function startScheduler(): void {
  if (g.__earshotScheduler) return;
  const minutes = Math.max(5, Number(process.env.INGEST_INTERVAL_MINUTES ?? 60));
  g.__earshotScheduler = setInterval(() => void runCycle(), minutes * 60_000);
  g.__earshotScheduler.unref?.();
  // First cycle shortly after boot, once the server is serving.
  setTimeout(() => void runCycle(), 30_000).unref?.();
  console.log(`[scheduler] listening every ${minutes} minutes`);
}
