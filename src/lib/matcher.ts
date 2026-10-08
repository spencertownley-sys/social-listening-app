import { learnedScore, type LearningState } from "./learning";
import type { ListeningProfile, ProfileConfig } from "./profile";
import { compileTerm, evaluate, makeDoc, parseQuery, positiveAtoms, type Atom, type QueryDoc, type QueryNode } from "./query";
import { keyStems, semanticMatch, stem } from "./semantic";
import { INTENT_LABELS, type Enrichment, type Match, type MatchReason, type Post, type Sentiment } from "./types";

/**
 * Applies one Listening Profile to one enriched post: hard rules first (sources, exclusions,
 * what-to-hear, author, content, language, sentiment, intent), then a relevance score that
 * includes what the profile learned from feedback. Every kept post carries the reasons it was kept.
 */

const JOBS = /\b(we're hiring|we are hiring|now hiring|job opening|apply now|job alert|#hiring|#jobs?\b|careers? at)/i;
const GIVEAWAYS = /\b(giveaway|give away|sweepstakes?|win a free|enter to win|#contest|#win\b|retweet to win|repost to win)/i;
const BOTLIKE_HANDLE = /(bot|_feed|rss|autopost|news_?alerts?)$/i;

export interface CompiledProfile {
  profile: ListeningProfile;
  any: QueryNode[];
  all: QueryNode[];
  query?: QueryNode;
  exclude: QueryNode[];
}

const compileCache = new Map<string, CompiledProfile>();

export function compileProfile(profile: ListeningProfile): CompiledProfile {
  const key = `${profile.id}@${profile.version}:${profile.updatedAt}`;
  const hit = compileCache.get(key);
  if (hit) return hit;
  const c = profile.config;
  const compiled: CompiledProfile = {
    profile,
    any: c.match.any.map(compileTerm),
    all: c.match.all.map(compileTerm),
    query: c.match.query ? parseQuery(c.match.query) : undefined,
    exclude: c.match.exclude.map(compileTerm),
  };
  compileCache.set(key, compiled);
  return compiled;
}

function engagementTotal(p: Post): number {
  const e = p.engagement;
  return (e.likes ?? 0) + 2 * (e.reposts ?? 0) + (e.replies ?? 0);
}

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
};

export function matchPost(
  compiled: CompiledProfile,
  post: Post,
  enrichment: Enrichment,
  learning?: LearningState,
  doc: QueryDoc = makeDoc({ text: post.text, title: post.title, links: post.links, authorHandle: post.author.handle }),
): Match | null {
  const { profile } = compiled;
  const c: ProfileConfig = profile.config;
  const reasons: MatchReason[] = [];

  // 1. Sources
  const weight = c.sources[post.network] ?? 0;
  if (weight <= 0) return null;

  // 2. Muted / own accounts
  const handle = post.author.handle.toLowerCase().replace(/^@/, "");
  const muted = [...c.author.muted, ...(learning?.mutedAuthors ?? []), ...c.author.own_accounts].map((h) =>
    h.toLowerCase().replace(/^@/, ""),
  );
  if (muted.includes(handle)) return null;

  // 3. Exclusions
  if (compiled.exclude.some((n) => evaluate(n, doc).ok)) return null;
  const fullText = [post.title, post.text].filter(Boolean).join("\n");
  if (c.match.exclude_presets.includes("jobs") && JOBS.test(fullText)) return null;
  if (c.match.exclude_presets.includes("giveaways") && GIVEAWAYS.test(fullText)) return null;
  const looksBot = (post.author.botScore ?? 0) >= 0.7 || BOTLIKE_HANDLE.test(handle);
  if ((c.match.exclude_presets.includes("bots") || c.author.exclude_bots) && looksBot) return null;

  // 4. What to hear
  for (const n of compiled.all) {
    const r = evaluate(n, doc);
    if (!r.ok) return null;
    reasons.push(...r.hits.map((h) => ({ kind: "term" as const, detail: `contains ${h}` })));
  }
  let whatHit = compiled.any.length === 0 && !compiled.query && !c.match.semantic && compiled.all.length > 0;
  for (const n of compiled.any) {
    const r = evaluate(n, doc);
    if (r.ok) {
      whatHit = true;
      reasons.push(...r.hits.map((h) => ({ kind: "term" as const, detail: `mentions ${h}` })));
    }
  }
  if (compiled.query) {
    const r = evaluate(compiled.query, doc);
    if (r.ok) {
      whatHit = true;
      reasons.push({ kind: "term", detail: `query matched (${r.hits.slice(0, 3).join(", ") || "rule"})` });
    }
  }
  if (c.match.semantic) {
    const s = semanticMatch(c.match.semantic, doc.tokens);
    if (s.ok) {
      whatHit = true;
      reasons.push({ kind: "semantic", detail: `on topic: ${s.matched.join(", ")}` });
    }
  }
  if (!whatHit) return null;

  // 5. Language / geography
  if (c.language.length && post.lang && !c.language.includes(post.lang.slice(0, 2).toLowerCase())) return null;
  if (c.countries.length && post.country && !c.countries.includes(post.country.toUpperCase())) return null;

  // 6. Author
  const followers = post.author.followerCount;
  if (c.author.min_followers !== undefined && (followers ?? 0) < c.author.min_followers) return null;
  if (c.author.max_followers !== undefined && followers !== undefined && followers > c.author.max_followers) return null;
  if (c.author.verified_only && !post.author.verified) return null;
  if (c.author.min_account_age_days !== undefined && post.author.accountCreatedAt) {
    const ageDays = (Date.parse(post.postedAt) - Date.parse(post.author.accountCreatedAt)) / 86_400_000;
    if (ageDays < c.author.min_account_age_days) return null;
  }

  // 7. Content
  if (!c.content.kinds.includes(post.kind)) return null;
  if (c.content.has_media === true && post.media.length === 0) return null;
  if (c.content.has_media === false && post.media.length > 0) return null;
  if (c.content.has_link === true && post.links.length === 0) return null;
  if (c.content.has_link === false && post.links.length > 0) return null;
  if (c.content.video_only && !post.media.some((m) => m.type === "video") && post.network !== "youtube") return null;
  if (engagementTotal(post) < c.content.min_engagement) return null;

  // 8. Sentiment (a user's correction wins over the classifier)
  const corrected = learning?.sentimentOverrides[post.id];
  const sentiment = corrected ?? enrichment.sentiment;
  const confidence = corrected ? 1 : enrichment.sentimentConfidence;
  if (!c.sentiment.keep.includes(sentiment)) return null;
  if (confidence < c.sentiment.min_confidence) return null;
  if (c.sentiment.keep.length < 4) {
    reasons.push({
      kind: "sentiment",
      detail: `${SENTIMENT_LABEL[sentiment]} (${corrected ? "corrected by you" : `${Math.round(confidence * 100)}% confident`})`,
    });
  }

  // 9. Emotion / intent
  if (c.emotions.length) {
    const hit = enrichment.emotions.filter((e) => c.emotions.includes(e));
    if (hit.length === 0) return null;
    reasons.push({ kind: "emotion", detail: `emotion: ${hit.join(", ")}` });
  }
  if (c.intents.length) {
    const hit = enrichment.intents.filter((i) => c.intents.includes(i));
    if (hit.length === 0) return null;
    reasons.push({ kind: "intent", detail: hit.map((i) => INTENT_LABELS[i]).join(", ") });
  }

  // Relevance
  const learned = learnedScore(learning, post);
  if (learned.score <= -3) return null; // the user has said "never this" about posts like it
  if (learned.score >= 1) reasons.push({ kind: "learning", detail: `like posts you rated up (${learned.top.join(", ")})` });

  let relevance = 40;
  relevance += (weight / 100) * 15;
  relevance += Math.min(15, Math.log10(1 + engagementTotal(post)) * 5);
  relevance += Math.min(10, reasons.filter((r) => r.kind === "term" || r.kind === "semantic").length * 4);
  relevance += (confidence - 0.5) * 10;
  relevance += Math.max(-25, Math.min(25, learned.score * 5));
  relevance = Math.round(Math.max(0, Math.min(100, relevance)));

  return {
    id: `${profile.id}:${post.id}`,
    profileId: profile.id,
    profileVersion: profile.version,
    postId: post.id,
    reasons: dedupeReasons(reasons),
    relevance,
    createdAt: new Date().toISOString(),
  };
}

function dedupeReasons(reasons: MatchReason[]): MatchReason[] {
  const seen = new Set<string>();
  return reasons.filter((r) => {
    const k = `${r.kind}:${r.detail.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Cheap pre-filter: one pass over every incoming post against the union of all active profiles,
// so only candidates are sent to (paid) AI enrichment.

export interface PreFilter {
  atoms: Atom[];
  semanticStems: Set<string>;
  test(post: Post, doc?: QueryDoc): boolean;
}

export function buildPreFilter(profiles: ListeningProfile[]): PreFilter {
  const atoms: Atom[] = [];
  const semanticStems = new Set<string>();
  for (const p of profiles) {
    if (p.status !== "active") continue;
    const cp = compileProfile(p);
    for (const n of [...cp.any, ...cp.all, ...(cp.query ? [cp.query] : [])]) atoms.push(...positiveAtoms(n));
    if (p.config.match.semantic) for (const s of keyStems(p.config.match.semantic)) semanticStems.add(s);
  }
  const atomNodes: QueryNode[] = atoms.map((atom) => ({ type: "atom", atom, label: "" }));
  return {
    atoms,
    semanticStems,
    test(post, doc = makeDoc({ text: post.text, title: post.title, links: post.links })) {
      if (atomNodes.some((n) => evaluate(n, doc).ok)) return true;
      if (semanticStems.size) for (const t of doc.tokens) if (semanticStems.has(stem(t))) return true;
      return false;
    },
  };
}
