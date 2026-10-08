import { z } from "zod";
import { compileTerm, parseQuery } from "./query";
import { EMOTIONS, INTENTS, NETWORKS, SENTIMENTS, type Network } from "./types";

/**
 * The Listening Profile config, stored as JSON (snake_case, matching the PRD's example).
 * Every layer except `sources` and `match` is optional; defaults are filled by `parseProfileConfig`.
 */

const weight = z.number().int().min(0).max(100);

export const SourcesSchema = z.partialRecord(z.enum(NETWORKS), weight);

export const ProfileConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  /** Layers 1 + 2: networks and their weight. 0 or missing = off. */
  sources: SourcesSchema,
  /** Layers 3 + 4 + 5: what to hear, and what never to show. */
  match: z.object({
    /** Any of these terms. Each entry uses the query syntax (phrases, #tags, @handles, domain:). */
    any: z.array(z.string().trim().min(1)).default([]),
    /** Every one of these must also appear. */
    all: z.array(z.string().trim().min(1)).default([]),
    /** Optional advanced boolean query, e.g. `("cruise" OR ship) AND wifi NOT giveaway`. */
    query: z.string().trim().optional(),
    /** Plain-English topic, matched by meaning. */
    semantic: z.string().trim().optional(),
    /** Words, phrases, @accounts or domain: entries that remove a post. */
    exclude: z.array(z.string().trim().min(1)).default([]),
    /** Preset exclusions. */
    exclude_presets: z.array(z.enum(["jobs", "giveaways", "bots"])).default(["giveaways", "jobs"]),
  }),
  /** Layer 6. */
  sentiment: z
    .object({
      keep: z.array(z.enum(SENTIMENTS)).min(1).default([...SENTIMENTS]),
      min_confidence: z.number().min(0).max(1).default(0),
    })
    .default({ keep: [...SENTIMENTS], min_confidence: 0 }),
  /** Layer 7. Empty = no filter. */
  emotions: z.array(z.enum(EMOTIONS)).default([]),
  intents: z.array(z.enum(INTENTS)).default([]),
  /** Layer 8. */
  author: z
    .object({
      min_followers: z.number().int().min(0).optional(),
      max_followers: z.number().int().min(0).optional(),
      verified_only: z.boolean().default(false),
      exclude_bots: z.boolean().default(true),
      own_accounts: z.array(z.string()).default([]),
      min_account_age_days: z.number().int().min(0).optional(),
      muted: z.array(z.string()).default([]),
    })
    .default({ verified_only: false, exclude_bots: true, own_accounts: [], muted: [] }),
  /** Layer 9. */
  content: z
    .object({
      kinds: z.array(z.enum(["original", "reply", "repost"])).default(["original", "reply"]),
      has_media: z.boolean().optional(),
      has_link: z.boolean().optional(),
      min_engagement: z.number().int().min(0).default(0),
      video_only: z.boolean().default(false),
    })
    .default({ kinds: ["original", "reply"], min_engagement: 0, video_only: false }),
  /** Layer 10. Empty = any. */
  language: z.array(z.string().min(2).max(8)).default([]),
  countries: z.array(z.string().length(2)).default([]),
  /** Layer 11. */
  delivery: z
    .object({
      mode: z.enum(["realtime", "digest", "spike"]).default("digest"),
      cadence: z.enum(["hourly", "daily", "weekly"]).default("daily"),
      channels: z
        .array(z.enum(["in_app", "email", "push", "sms", "slack", "discord", "webhook"]))
        .default(["in_app", "email"]),
      spike_multiplier: z.number().min(1).default(3),
    })
    .default({ mode: "digest", cadence: "daily", channels: ["in_app", "email"], spike_multiplier: 3 }),
  /** Layer 12. */
  quiet_hours: z
    .object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), tz: z.string() })
    .optional(),
  caps: z
    .object({ max_alerts_per_day: z.number().int().min(1).default(20), bundle_similar: z.boolean().default(true) })
    .default({ max_alerts_per_day: 20, bundle_similar: true }),
});

export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;
export type ProfileConfigInput = z.input<typeof ProfileConfigSchema>;

export interface ListeningProfile {
  id: string;
  workspaceId: string;
  version: number;
  status: "active" | "paused";
  config: ProfileConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileVersion {
  profileId: string;
  version: number;
  config: ProfileConfig;
  createdAt: string;
}

export function parseProfileConfig(input: unknown): ProfileConfig {
  const config = ProfileConfigSchema.parse(input);
  const hasWhat =
    config.match.any.length > 0 || config.match.all.length > 0 || !!config.match.query || !!config.match.semantic;
  if (!hasWhat) {
    throw new z.ZodError([
      { code: "custom", path: ["match"], message: "Add at least one keyword, query or topic to listen for.", input },
    ]);
  }
  // Syntax errors surface here (as QuerySyntaxError) instead of at ingest time.
  for (const t of [...config.match.any, ...config.match.all, ...config.match.exclude]) compileTerm(t);
  if (config.match.query) parseQuery(config.match.query);
  if (activeSources(config).length === 0) {
    throw new z.ZodError([
      { code: "custom", path: ["sources"], message: "Turn on at least one network.", input },
    ]);
  }
  return config;
}

export function activeSources(config: Pick<ProfileConfig, "sources">): Network[] {
  return NETWORKS.filter((n) => (config.sources[n] ?? 0) > 0);
}

/** The networks the MVP has connectors for. Others can be toggled but won't ingest yet. */
export const LIVE_NETWORKS: Network[] = ["bluesky", "youtube", "news", "mastodon"];

const ALL_LIVE_ON = Object.fromEntries(LIVE_NETWORKS.map((n) => [n, 100])) as Partial<Record<Network, number>>;

export interface ProfileTemplate {
  id: string;
  name: string;
  blurb: string;
  /** Builds the config from what the user typed in step 1 (brand, show, topic...). */
  build: (subjectTerms: string[], competitorTerms?: string[]) => ProfileConfigInput;
}

export const TEMPLATES: ProfileTemplate[] = [
  {
    id: "brand-health",
    name: "Brand Health",
    blurb: "Everything people say about you, every tone, daily digest.",
    build: (terms) => ({
      name: `${terms[0] ?? "Brand"} — brand health`,
      sources: ALL_LIVE_ON,
      match: { any: terms },
      delivery: { mode: "digest", cadence: "daily" },
    }),
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    blurb: "What people dislike (and like) about your competitors.",
    build: (_terms, competitors = []) => ({
      name: `Competitor watch`,
      sources: ALL_LIVE_ON,
      match: { any: competitors.length ? competitors : _terms },
      sentiment: { keep: ["negative", "mixed", "positive"], min_confidence: 0.5 },
      intents: ["complaint", "praise", "churn_risk"],
      delivery: { mode: "digest", cadence: "weekly" },
    }),
  },
  {
    id: "crisis-radar",
    name: "Crisis Radar",
    blurb: "Negative and angry posts only; alert when volume spikes.",
    build: (terms) => ({
      name: `${terms[0] ?? "Brand"} — crisis radar`,
      sources: ALL_LIVE_ON,
      match: { any: terms },
      sentiment: { keep: ["negative"], min_confidence: 0.6 },
      delivery: { mode: "spike", cadence: "hourly", channels: ["in_app", "email", "sms"], spike_multiplier: 3 },
    }),
  },
  {
    id: "lead-finder",
    name: "Lead Finder",
    blurb: "People asking for a recommendation in your category.",
    build: (terms) => ({
      name: `Leads — ${terms[0] ?? "my category"}`,
      sources: ALL_LIVE_ON,
      match: { any: terms },
      intents: ["recommendation_request", "purchase_intent", "question"],
      delivery: { mode: "realtime", cadence: "hourly" },
    }),
  },
  {
    id: "fan-love",
    name: "Fan Love",
    blurb: "Happy posts you can reshare, weekly.",
    build: (terms) => ({
      name: `${terms[0] ?? "Show"} — fan love`,
      sources: { bluesky: 100, youtube: 80, mastodon: 60, news: 40 },
      match: { any: terms },
      sentiment: { keep: ["positive", "mixed"], min_confidence: 0.6 },
      intents: ["praise", "question"],
      author: { min_followers: 0, exclude_bots: true },
      delivery: { mode: "digest", cadence: "weekly", channels: ["email", "push"] },
    }),
  },
  {
    id: "product-feedback",
    name: "Product Feedback",
    blurb: "Feature requests, bugs and churn signals.",
    build: (terms) => ({
      name: `${terms[0] ?? "Product"} — feedback`,
      sources: { bluesky: 100, youtube: 70, mastodon: 60 },
      match: { any: terms },
      intents: ["feature_request", "complaint", "churn_risk"],
      delivery: { mode: "digest", cadence: "daily" },
    }),
  },
  {
    id: "topic-trends",
    name: "Topic Trends",
    blurb: "The whole conversation on a topic, any sentiment, trend charts.",
    build: (terms) => ({
      name: `Trends — ${terms[0] ?? "topic"}`,
      sources: ALL_LIVE_ON,
      match: { any: terms },
      content: { kinds: ["original", "reply", "repost"] },
      delivery: { mode: "digest", cadence: "weekly" },
    }),
  },
];
