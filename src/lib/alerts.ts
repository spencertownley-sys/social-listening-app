import { feedFor, type FeedItem } from "./analytics";
import { buildDigest, sendEmail } from "./digest";
import type { ListeningProfile } from "./profile";
import { newId, type AppNotification, type StoreData } from "./store";
import { NETWORK_LABELS } from "./types";

/**
 * PRD layers 11 + 12: turn new matches into alerts. Runs after every ingest (scheduler or
 * /api/cron). Per profile, by delivery mode:
 *  - realtime: one bundled alert for the matches created since the last one
 *  - spike:    an alert when the last hour's matches reach `spike_multiplier` × the hourly
 *              average of the previous 7 days (and at least MIN_SPIKE posts)
 *  - digest:   the digest for the cadence window, once per hour/day/week
 * Quiet hours defer alerts (nothing is lost; they go out on the first run after), and
 * `caps.max_alerts_per_day` limits alerts per profile per day.
 */

const CADENCE_MS = { hourly: 3_600_000, daily: 86_400_000, weekly: 7 * 86_400_000 } as const;
const MIN_SPIKE = 5;
const SPIKE_COOLDOWN_MS = 6 * 3_600_000;

export function inQuietHours(q: ListeningProfile["config"]["quiet_hours"], now: Date): boolean {
  if (!q) return false;
  let hhmm: string;
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: q.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  } catch {
    return false; // unknown time zone: don't silently swallow alerts
  }
  const { start, end } = q;
  return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

export function detectSpike(items: FeedItem[], multiplier: number, now: number): { current: number; baseline: number } | null {
  const hour = 3_600_000;
  let current = 0;
  let previous = 0;
  for (const it of items) {
    const t = Date.parse(it.post.postedAt);
    if (t > now - hour && t <= now) current++;
    else if (t > now - 7 * 24 * hour && t <= now - hour) previous++;
  }
  const baseline = previous / (7 * 24 - 1);
  if (current >= MIN_SPIKE && current >= multiplier * Math.max(baseline, 0.5)) return { current, baseline };
  return null;
}

function summarize(items: FeedItem[], n = 5): string {
  return items
    .slice(0, n)
    .map((it) => `• [${it.sentiment}] ${NETWORK_LABELS[it.post.network]} · ${it.post.author.handle}: ${(it.post.title ?? it.post.text).slice(0, 140)}`)
    .join("\n");
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Deliver to every configured channel the profile asked for; returns the channels that worked. */
async function deliver(profile: ListeningProfile, n: Omit<AppNotification, "id" | "channels" | "read">, html?: string): Promise<string[]> {
  const wanted = profile.config.delivery.channels;
  const done = ["in_app"];
  const text = `${n.title}\n\n${n.body}`;
  if (wanted.includes("email")) {
    const r = await sendEmail(`${profile.config.name}: ${n.title}`, html ?? `<pre style="font-family:system-ui;white-space:pre-wrap">${esc(text)}</pre>`, text);
    if (r.sent) done.push("email");
  }
  if (wanted.includes("slack") && process.env.SLACK_WEBHOOK_URL) {
    if (await postJson(process.env.SLACK_WEBHOOK_URL, { text: `*${profile.config.name}: ${n.title}*\n${n.body}` })) done.push("slack");
  }
  if (wanted.includes("discord") && process.env.DISCORD_WEBHOOK_URL) {
    if (await postJson(process.env.DISCORD_WEBHOOK_URL, { content: `**${profile.config.name}: ${n.title}**\n${n.body}`.slice(0, 1990) })) done.push("discord");
  }
  if (wanted.includes("webhook") && process.env.ALERT_WEBHOOK_URL) {
    if (await postJson(process.env.ALERT_WEBHOOK_URL, { profile: { id: profile.id, name: profile.config.name }, ...n })) done.push("webhook");
  }
  return done;
}

export async function runAlerts(data: StoreData, now = new Date()): Promise<AppNotification[]> {
  const created: AppNotification[] = [];
  const nowMs = now.getTime();
  const today = now.toISOString().slice(0, 10);

  for (const profile of data.profiles) {
    if (profile.status !== "active") continue;
    const c = profile.config;
    const state = (data.alertState[profile.id] ??= {});
    if (inQuietHours(c.quiet_hours, now)) continue;
    const sentToday = data.notifications.filter((n) => n.profileId === profile.id && n.createdAt.startsWith(today)).length;
    if (sentToday >= c.caps.max_alerts_per_day) continue;

    const feed = feedFor(data, profile.id).sort((a, b) => b.match.relevance - a.match.relevance);
    let pending: { n: Omit<AppNotification, "id" | "channels" | "read">; html?: string } | null = null;

    if (c.delivery.mode === "realtime") {
      const since = Date.parse(state.lastRealtimeAt ?? profile.createdAt);
      const fresh = feed.filter((it) => Date.parse(it.match.createdAt) > since);
      if (fresh.length) {
        pending = {
          n: {
            profileId: profile.id,
            kind: "realtime",
            title: `${fresh.length} new mention${fresh.length === 1 ? "" : "s"}`,
            body: summarize(fresh) + (fresh.length > 5 ? `\n…and ${fresh.length - 5} more` : ""),
            postIds: fresh.map((it) => it.post.id),
            createdAt: now.toISOString(),
          },
        };
      }
      state.lastRealtimeAt = now.toISOString();
    } else if (c.delivery.mode === "spike") {
      const cooled = !state.lastSpikeAt || nowMs - Date.parse(state.lastSpikeAt) > SPIKE_COOLDOWN_MS;
      const spike = cooled ? detectSpike(feed, c.delivery.spike_multiplier, nowMs) : null;
      if (spike) {
        const hourItems = feed.filter((it) => Date.parse(it.post.postedAt) > nowMs - 3_600_000);
        pending = {
          n: {
            profileId: profile.id,
            kind: "spike",
            title: `Spike: ${spike.current} mentions in the last hour (usual ≈ ${spike.baseline.toFixed(1)}/hour)`,
            body: summarize(hourItems),
            postIds: hourItems.map((it) => it.post.id),
            createdAt: now.toISOString(),
          },
        };
        state.lastSpikeAt = now.toISOString();
      }
    } else {
      const last = Date.parse(state.lastDigestAt ?? profile.createdAt);
      if (nowMs - last >= CADENCE_MS[c.delivery.cadence]) {
        const digest = buildDigest(profile, feed, now);
        state.lastDigestAt = now.toISOString();
        if (digest.items.length) {
          pending = {
            n: {
              profileId: profile.id,
              kind: "digest",
              title: digest.summaryLine,
              body: summarize(digest.items, 10),
              postIds: digest.items.map((it) => it.post.id),
              createdAt: now.toISOString(),
            },
            html: digest.html,
          };
        }
      }
    }

    if (pending) {
      const channels = await deliver(profile, pending.n, pending.html);
      const n: AppNotification = { id: newId("ntf"), ...pending.n, channels, read: false };
      data.notifications.push(n);
      created.push(n);
    }
  }
  return created;
}
