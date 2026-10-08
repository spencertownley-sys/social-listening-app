export const NETWORKS = [
  "bluesky",
  "x",
  "threads",
  "facebook",
  "youtube",
  "tiktok",
  "reddit",
  "instagram",
  "news",
  "podcasts",
  "mastodon",
] as const;
export type Network = (typeof NETWORKS)[number];

export const NETWORK_LABELS: Record<Network, string> = {
  bluesky: "Bluesky",
  x: "X",
  threads: "Threads",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  reddit: "Reddit",
  instagram: "Instagram",
  news: "News & blogs",
  podcasts: "Podcasts",
  mastodon: "Mastodon",
};

export const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const EMOTIONS = ["joy", "anger", "frustration", "fear", "sarcasm", "excitement"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const INTENTS = [
  "complaint",
  "praise",
  "question",
  "recommendation_request",
  "purchase_intent",
  "churn_risk",
  "feature_request",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABELS: Record<Intent, string> = {
  complaint: "Complaint",
  praise: "Praise",
  question: "Question",
  recommendation_request: "Asking for a recommendation",
  purchase_intent: "Purchase intent",
  churn_risk: "Churn risk",
  feature_request: "Feature request",
};

export interface Author {
  handle: string;
  displayName?: string;
  followerCount?: number;
  verified?: boolean;
  botScore?: number; // 0..1, higher = more bot-like
  accountCreatedAt?: string;
}

export type PostKind = "original" | "reply" | "repost";

/** One post in the normalized schema every connector produces. */
export interface Post {
  id: string; // `${network}:${externalId}`
  network: Network;
  externalId: string;
  url: string;
  author: Author;
  text: string;
  title?: string;
  lang?: string;
  country?: string;
  postedAt: string; // ISO 8601
  kind: PostKind;
  media: { type: "image" | "video"; url: string; thumbnailUrl?: string }[];
  links: string[];
  engagement: { likes?: number; reposts?: number; replies?: number; views?: number };
  ingestedAt: string;
}

export interface Enrichment {
  postId: string;
  sentiment: Sentiment;
  sentimentConfidence: number; // 0..1
  emotions: Emotion[];
  intents: Intent[];
  topics: string[];
  model: string; // which classifier produced this (e.g. "heuristic-v1", "claude-haiku-5-5")
}

/** A single reason a post was kept for a profile; rendered as "why this matched". */
export interface MatchReason {
  kind: "term" | "semantic" | "sentiment" | "intent" | "emotion" | "learning" | "source";
  detail: string;
}

export interface Match {
  id: string; // `${profileId}:${postId}`
  profileId: string;
  profileVersion: number;
  postId: string;
  reasons: MatchReason[];
  relevance: number; // 0..100
  createdAt: string;
}

export const FEEDBACK_ACTIONS = [
  "relevant",
  "not_relevant",
  "wrong_sentiment",
  "mute_author",
  "more_like_this",
] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export interface Feedback {
  id: string;
  profileId: string;
  postId: string;
  action: FeedbackAction;
  correctedSentiment?: Sentiment;
  createdAt: string;
}
