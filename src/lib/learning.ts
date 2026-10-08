import { fold } from "./query";
import { stem } from "./semantic";
import type { Feedback, Post, Sentiment } from "./types";

/**
 * Per-profile relevance learning (PRD layer 13). Each feedback action nudges weights on the
 * content words of the post it was given on; future posts sharing those words score higher or
 * lower. Muted authors and sentiment corrections are stored here too, so feedback never needs a
 * new profile version.
 */

export interface LearningState {
  profileId: string;
  tokenWeights: Record<string, number>;
  mutedAuthors: string[];
  sentimentOverrides: Record<string, Sentiment>; // postId -> corrected sentiment
  feedbackCount: number;
}

export function emptyLearning(profileId: string): LearningState {
  return { profileId, tokenWeights: {}, mutedAuthors: [], sentimentOverrides: {}, feedbackCount: 0 };
}

const COMMON = new Set(
  "the and for that this with you your are was were have has had but not they them their from just what when about will would there been some more than then very really".split(
    " ",
  ),
);

export function contentStems(text: string): string[] {
  const out = new Set<string>();
  for (const w of fold(text).match(/[\p{L}\p{N}]{3,}/gu) ?? []) if (!COMMON.has(w)) out.add(stem(w));
  return [...out];
}

const DELTA: Partial<Record<Feedback["action"], number>> = {
  relevant: 1,
  more_like_this: 2,
  not_relevant: -1.5,
};

export function applyFeedback(state: LearningState, feedback: Feedback, post: Post | undefined): LearningState {
  const next: LearningState = {
    ...state,
    tokenWeights: { ...state.tokenWeights },
    mutedAuthors: [...state.mutedAuthors],
    sentimentOverrides: { ...state.sentimentOverrides },
    feedbackCount: state.feedbackCount + 1,
  };
  const delta = DELTA[feedback.action];
  if (delta && post) {
    const stems = contentStems([post.title, post.text].filter(Boolean).join(" "));
    // Spread the update so long posts don't dominate.
    const per = delta / Math.sqrt(Math.max(1, stems.length));
    for (const s of stems) {
      const v = (next.tokenWeights[s] ?? 0) + per;
      next.tokenWeights[s] = Math.max(-5, Math.min(5, Math.round(v * 1000) / 1000));
    }
  }
  if (feedback.action === "mute_author" && post) {
    const h = post.author.handle.toLowerCase();
    if (!next.mutedAuthors.includes(h)) next.mutedAuthors.push(h);
  }
  if (feedback.action === "wrong_sentiment" && feedback.correctedSentiment) {
    next.sentimentOverrides[feedback.postId] = feedback.correctedSentiment;
  }
  return next;
}

/** Learned affinity for a post: positive means "more like what the user liked". */
export function learnedScore(state: LearningState | undefined, post: Post): { score: number; top: string[] } {
  if (!state || state.feedbackCount === 0) return { score: 0, top: [] };
  const stems = contentStems([post.title, post.text].filter(Boolean).join(" "));
  let score = 0;
  const contributions: [string, number][] = [];
  for (const s of stems) {
    const w = state.tokenWeights[s];
    if (w) {
      score += w;
      contributions.push([s, w]);
    }
  }
  contributions.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return { score, top: contributions.slice(0, 3).map(([s]) => s) };
}
