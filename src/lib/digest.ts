import { dashboardFor, type FeedItem } from "./analytics";
import type { ListeningProfile } from "./profile";
import { INTENT_LABELS, NETWORK_LABELS } from "./types";

/**
 * Email / in-app digest for a profile over its cadence window. The summary line is built from
 * counts; the AI-written summary from the PRD (P1) can replace `summaryLine` later.
 */

export interface Digest {
  subject: string;
  summaryLine: string;
  periodStart: string;
  periodEnd: string;
  items: FeedItem[];
  html: string;
  text: string;
}

const CADENCE_HOURS = { hourly: 1, daily: 24, weekly: 24 * 7 } as const;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildDigest(profile: ListeningProfile, feed: FeedItem[], now = new Date()): Digest {
  const hours = CADENCE_HOURS[profile.config.delivery.cadence];
  const start = new Date(now.getTime() - hours * 3_600_000);
  const items = feed
    .filter((it) => Date.parse(it.post.postedAt) >= start.getTime())
    .sort((a, b) => b.match.relevance - a.match.relevance);
  const d = dashboardFor(items, 1);
  const count = (s: string) => d.sentimentSplit.find((x) => x.sentiment === s)?.count ?? 0;
  const mostly =
    items.length === 0
      ? ""
      : count("positive") > count("negative") * 1.5
        ? "mostly positive"
        : count("negative") > count("positive") * 1.5
          ? "mostly negative"
          : "a mix of tones";
  const topIntent = d.intents[0];
  const period = profile.config.delivery.cadence === "weekly" ? "This week" : profile.config.delivery.cadence === "daily" ? "Today" : "This hour";
  const summaryLine =
    items.length === 0
      ? `${period}: no new mentions.`
      : `${period}: ${items.length} mention${items.length === 1 ? "" : "s"}, ${mostly}` +
        (topIntent ? `; ${topIntent.count} ${INTENT_LABELS[topIntent.intent as keyof typeof INTENT_LABELS].toLowerCase()}${topIntent.count === 1 ? "" : "s"}.` : ".");

  const top = items.slice(0, 10);
  const text = [
    `${profile.config.name}`,
    summaryLine,
    "",
    ...top.map(
      (it) =>
        `- [${it.sentiment}] ${NETWORK_LABELS[it.post.network]} · ${it.post.author.handle}: ${(it.post.title ?? it.post.text).slice(0, 180)}\n  ${it.post.url}`,
    ),
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;color:#111">
<h2 style="margin-bottom:4px">${esc(profile.config.name)}</h2>
<p style="color:#444;margin-top:0">${esc(summaryLine)}</p>
${top
  .map(
    (it) => `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0">
<div style="font-size:12px;color:#555">${esc(NETWORK_LABELS[it.post.network])} · ${esc(it.post.author.handle)} · <strong>${esc(it.sentiment)}</strong></div>
<div style="margin:6px 0">${esc((it.post.title ? it.post.title + " — " : "") + it.post.text.slice(0, 400))}</div>
<div style="font-size:12px;color:#555">Why: ${esc(it.match.reasons.map((r) => r.detail).join(" · "))}</div>
<a href="${esc(it.post.url)}" style="font-size:12px">Open original</a></div>`,
  )
  .join("\n")}
</body></html>`;

  return {
    subject: `${profile.config.name}: ${summaryLine}`,
    summaryLine,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    items,
    html,
    text,
  };
}

/** Send through Resend's HTTP API when RESEND_API_KEY and DIGEST_TO are configured. */
export async function sendDigestEmail(digest: Digest): Promise<{ sent: boolean; reason?: string }> {
  return sendEmail(digest.subject, digest.html, digest.text);
}

export async function sendEmail(subject: string, html: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO;
  if (!key || !to) return { sent: false, reason: "Set RESEND_API_KEY and DIGEST_TO to email digests." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM ?? "Earshot <digest@resend.dev>",
      to: to.split(",").map((s) => s.trim()),
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { sent: false, reason: `Resend returned ${res.status}` };
  return { sent: true };
}
