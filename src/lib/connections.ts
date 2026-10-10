import type { Network } from "./types";

/** What each network needs, for the Connections page. Details: docs/API_ACCESS.md. */
export interface ConnectionInfo {
  network: Network;
  name: string;
  env: string[];
  optional?: boolean; // works without keys (possibly reduced)
  cost: string;
  approval: string;
  portal?: string;
  note?: string;
}

export const CONNECTION_INFO: ConnectionInfo[] = [
  { network: "news", name: "News & RSS", env: [], optional: true, cost: "Free", approval: "None", note: "Google News search per term, plus any feeds in RSS_FEEDS." },
  { network: "mastodon", name: "Mastodon", env: [], optional: true, cost: "Free", approval: "None", note: "Public hashtag timelines on MASTODON_INSTANCES." },
  { network: "bluesky", name: "Bluesky", env: ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"], optional: true, cost: "Free", approval: "None", portal: "https://bsky.app/settings/app-passwords", note: "New posts arrive in real time from Bluesky's free firehose, no key needed. An app password adds hourly search, which also catches posts from before the server started." },
  { network: "youtube", name: "YouTube", env: ["YOUTUBE_API_KEY"], cost: "Free (10,000 quota units/day)", approval: "None to start", portal: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
  { network: "reddit", name: "Reddit", env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"], cost: "Free for non-commercial use; commercial needs an agreement", approval: "Manual Data API access request", portal: "https://www.reddit.com/prefs/apps" },
  { network: "x", name: "X", env: ["X_BEARER_TOKEN"], cost: "Pay-per-use, about $0.005 per post read (capped by X_DAILY_POST_BUDGET)", approval: "Self-serve", portal: "https://console.x.com" },
  { network: "threads", name: "Threads", env: ["THREADS_ACCESS_TOKEN"], cost: "Free", approval: "Meta App Review for public results", portal: "https://developers.facebook.com/apps" },
  { network: "instagram", name: "Instagram (hashtags only)", env: ["IG_USER_ID", "IG_ACCESS_TOKEN"], cost: "Free", approval: "Meta App Review + Business Verification", portal: "https://developers.facebook.com/apps" },
];

/** Networks with no legitimate keyword-search API for a commercial listening app (Oct 2026). */
export const UNAVAILABLE: { name: string; why: string }[] = [
  { name: "Facebook", why: "No public keyword search. Page Public Content Access can read known Pages only." },
  { name: "TikTok", why: "The Research API that can search is limited to academic and non-profit researchers." },
  { name: "LinkedIn", why: "No public post search. The Community Management API covers only Pages you administer." },
];

export function missingEnv(info: ConnectionInfo): string[] {
  return info.env.filter((k) => !process.env[k] && k !== "REDDIT_USER_AGENT");
}
