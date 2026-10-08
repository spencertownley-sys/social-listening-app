import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EMOTIONS, INTENTS, SENTIMENTS, type Enrichment, type Post } from "../types";
import { enrichHeuristic } from "./heuristic";

/**
 * Sentiment / emotion / intent labelling with Claude. Per the PRD this is the "small fast model
 * at volume" step, so it defaults to Claude Haiku 5.5 at low effort; override with ENRICH_MODEL.
 * Only posts that survived the cheap pre-filter reach this function.
 */

export const ENRICH_MODEL = process.env.ENRICH_MODEL ?? "claude-haiku-5-5";
const BATCH_SIZE = 25;

const LabelSchema = z.object({
  labels: z.array(
    z.object({
      id: z.string(),
      sentiment: z.enum(SENTIMENTS),
      sentiment_confidence: z.number().describe("0 to 1"),
      emotions: z.array(z.enum(EMOTIONS)),
      intents: z.array(z.enum(INTENTS)),
      topics: z.array(z.string()).describe("1-3 short lowercase topic labels"),
    }),
  ),
});

const SYSTEM = `You label public social media posts for a social listening tool.
For each post return:
- sentiment: the author's overall tone toward what they discuss: positive, neutral, negative, or mixed (clearly both).
- sentiment_confidence: 0-1, how sure you are. Sarcasm, slang and very short posts deserve lower confidence.
- emotions: any that clearly apply among ${EMOTIONS.join(", ")}. Read sarcasm as sarcasm, and label the underlying sentiment.
- intents: any that clearly apply among ${INTENTS.join(", ")}. "recommendation_request" means the author asks others what to choose; "churn_risk" means they signal leaving a product or brand.
- topics: 1-3 short lowercase labels for what the post is about.
Return exactly one label per post id, and nothing for ids you were not given.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function claudeEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function labelBatch(posts: Post[]): Promise<Enrichment[]> {
  const payload = posts.map((p) => ({
    id: p.id,
    network: p.network,
    text: [p.title, p.text].filter(Boolean).join("\n").slice(0, 2000),
  }));
  const response = await getClient().messages.parse({
    model: ENRICH_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(LabelSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return enrichHeuristic(posts);
  }
  const byId = new Map(response.parsed_output.labels.map((l) => [l.id, l]));
  const fallback = new Map(enrichHeuristic(posts).map((e) => [e.postId, e]));
  return posts.map((p) => {
    const l = byId.get(p.id);
    if (!l) return fallback.get(p.id)!;
    return {
      postId: p.id,
      sentiment: l.sentiment,
      sentimentConfidence: Math.max(0, Math.min(1, l.sentiment_confidence)),
      emotions: l.emotions,
      intents: l.intents,
      topics: l.topics.slice(0, 3),
      model: ENRICH_MODEL,
    };
  });
}

/** Enrich posts with Claude when credentials are present, otherwise with the heuristic. */
export async function enrichPosts(posts: Post[]): Promise<Enrichment[]> {
  if (posts.length === 0) return [];
  if (!claudeEnabled()) return enrichHeuristic(posts);
  const out: Enrichment[] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      out.push(...(await labelBatch(batch)));
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.error(`[enrich] Claude ${error.status ?? "error"}: ${error.message}; using heuristic for this batch`);
        out.push(...enrichHeuristic(batch));
      } else {
        throw error;
      }
    }
  }
  return out;
}
