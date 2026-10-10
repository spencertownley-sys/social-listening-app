import { fold } from "../query";
import type { Emotion, Enrichment, Intent, Post, Sentiment } from "../types";

/** Bump when the rules change so stored labels from older versions get redone. */
export const HEURISTIC_MODEL = "heuristic-v2";

/**
 * Offline fallback classifier: a small lexicon with negation and intensifiers, plus regex intents.
 * It is deliberately simple; the Claude classifier replaces it whenever ANTHROPIC_API_KEY is set,
 * and user corrections ("wrong sentiment") override both.
 */

const POSITIVE = new Set(
  (
    "love loved loving lovely great amazing awesome excellent fantastic wonderful best beautiful perfect " +
    "happy glad enjoy enjoyed enjoying fun favorite favourite recommend recommended impressed incredible " +
    "brilliant superb delightful stunning smooth friendly helpful clean delicious thanks thank grateful " +
    "nice good fabulous gorgeous spotless relaxing magical worth cool epic solid fast"
  ).split(" "),
);

const NEGATIVE = new Set(
  (
    "hate hated awful terrible horrible worst bad poor disappointing disappointed disappointment angry " +
    "furious annoyed annoying frustrated frustrating rude dirty broken slow late delayed delay cancelled " +
    "canceled skipped scam ripoff overpriced useless sick ill outbreak norovirus crowded nightmare unacceptable " +
    "complaint complain complained ruined stuck lost dead mess sucks sucked boring gross unsafe lawsuit " +
    "fail failed failure bug buggy crash crashes crashing laggy expensive meh never"
  ).split(" "),
);

const NEGATORS = new Set(["not", "no", "never", "isn't", "wasn't", "don't", "didn't", "can't", "won't", "hardly", "nothing"]);
const INTENSIFIERS = new Set(["very", "so", "really", "extremely", "super", "absolutely", "totally", "incredibly"]);

const EMOTION_PATTERNS: [Emotion, RegExp][] = [
  ["joy", /\b(love|happy|joy|delight|smil|best day|so good|blessed|grateful)/],
  ["anger", /\b(furious|angry|outrage|livid|unacceptable|disgust|how dare|fed up)/],
  ["frustration", /\b(frustrat|annoy|ugh+|again\?|still (not|no)|for the \w+ time|waited|waiting|on hold)/],
  ["fear", /\b(scared|afraid|worried|worry|nervous|unsafe|anxious|terrif)/],
  ["sarcasm", /\b(oh great|yeah right|just great|thanks a lot|love that for (me|us)|wow, )|\/s\b/],
  ["excitement", /(!{2,}|\b(can't wait|cannot wait|so excited|excited|counting down|finally|yay|woo+)\b)/],
];

const INTENT_PATTERNS: [Intent, RegExp][] = [
  ["question", /\?|^(how|what|when|where|why|who|which|does|do|is|are|can|should)\b/m],
  [
    "recommendation_request",
    /\b(any (recs|recommendations|suggestions)|recommend (a|an|me|some)|looking for (a|an|some)|which .* should i|best .* for|what('s| is) the best|suggestions\?)/,
  ],
  ["purchase_intent", /\b(want to (buy|book)|going to (buy|book)|thinking of (buying|booking)|ready to (buy|book)|where can i (buy|get)|just booked|booking (a|our|my))/],
  ["churn_risk", /\b(cancel(l?ing)? my|never (again|sailing|buying|using)|switching to|done with|last time i|unsubscrib|moving to)/],
  ["feature_request", /\b(wish (it|they|you) (had|would)|please add|would love (it )?if|feature request|should add|why can't (i|you))/],
  ["complaint", /\b(complain|unacceptable|refund|worst|terrible|awful|ruined|rude|broken|never again|disappointed|nightmare|frustrat|got my order wrong|waited \d+)/],
  ["praise", /\b(shout ?out|kudos|props to|love (this|that|the|my|our)|best (\w+ )?ever|amazing|thank you|highly recommend)/],
];

export function classifyText(text: string): Omit<Enrichment, "postId" | "model" | "topics"> {
  const folded = fold(text);
  const tokens = folded.match(/[\p{L}']+|[!?.,;:]/gu) ?? [];
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const isPos = POSITIVE.has(w);
    const isNeg = NEGATIVE.has(w);
    if (!isPos && !isNeg) continue;
    let weight = 1;
    let flipped = false;
    // Look back up to 3 words for negators/intensifiers, stopping at punctuation so
    // "no explanation. Disappointed" doesn't negate "disappointed".
    let start = i;
    while (start > Math.max(0, i - 3) && !/^[!?.,;:]$/.test(tokens[start - 1])) start--;
    for (let k = start; k < i; k++) {
      if (NEGATORS.has(tokens[k])) flipped = !flipped;
      if (INTENSIFIERS.has(tokens[k])) weight = 1.5;
    }
    if ((isPos && !flipped) || (isNeg && flipped)) pos += weight;
    else neg += weight;
  }

  const emotions = EMOTION_PATTERNS.filter(([, re]) => re.test(folded)).map(([e]) => e);
  const intents = INTENT_PATTERNS.filter(([, re]) => re.test(folded)).map(([i]) => i);
  if (emotions.includes("sarcasm") && pos > neg) {
    // "Oh great, another delay" reads positive to a lexicon; sarcasm flips it.
    [pos, neg] = [neg, pos + 1];
  }

  if (intents.includes("question") && Math.abs(pos - neg) <= 1 && emotions.length === 0) {
    // "Is the wifi fast enough?" asks; it doesn't praise.
    pos = Math.min(pos, 0.5);
    neg = Math.min(neg, 0.5);
  }
  const total = pos + neg;
  let sentiment: Sentiment;
  let confidence: number;
  if (total === 0) {
    sentiment = "neutral";
    confidence = 0.55;
  } else if (pos > 0 && neg > 0 && Math.min(pos, neg) / Math.max(pos, neg) >= 0.6) {
    sentiment = "mixed";
    confidence = 0.55 + Math.min(0.25, total * 0.04);
  } else {
    sentiment = pos > neg ? "positive" : "negative";
    const margin = Math.abs(pos - neg) / total;
    confidence = Math.min(0.95, 0.5 + margin * 0.3 + Math.min(0.15, total * 0.05));
  }
  return { sentiment, sentimentConfidence: Math.round(confidence * 100) / 100, emotions, intents };
}

export function enrichHeuristic(posts: Post[]): Enrichment[] {
  return posts.map((p) => ({
    postId: p.id,
    ...classifyText([p.title, p.text].filter(Boolean).join("\n")),
    topics: [],
    model: HEURISTIC_MODEL,
  }));
}
