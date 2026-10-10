import Anthropic from "@anthropic-ai/sdk";
import type { FeedItem } from "./analytics";
import { claudeEnabled } from "./enrich/claude";
import { NETWORK_LABELS } from "./types";

/**
 * PRD "AI digest summary": a few sentences on what people said in a digest window, e.g. "142
 * mentions, mostly positive; 3 complaints about audio quality." Uses the larger model (PRD:
 * "a larger model for weekly summaries"); returns null without credentials or on any failure,
 * and the digest falls back to its count-based line.
 */

export const SUMMARY_MODEL = process.env.SUMMARY_MODEL ?? "claude-opus-5-5";
const MAX_POSTS = 80;

const SYSTEM = `You write the opening of a social listening digest for a busy reader.
Given the period's matched posts (network, sentiment, intents, text), write 2-4 plain sentences:
the overall volume and tone, the main themes, and anything that needs attention (complaints,
questions to answer, a rising issue). Cite counts where they help. No headings, no bullet points,
no greeting, and don't invent anything that isn't in the posts. Write in English.`;

let client: Anthropic | null = null;

export async function summarizeItems(profileName: string, periodLabel: string, items: FeedItem[]): Promise<string | null> {
  if (!claudeEnabled() || items.length === 0) return null;
  client ??= new Anthropic();
  const sample = items.slice(0, MAX_POSTS).map((it) => ({
    network: NETWORK_LABELS[it.post.network],
    sentiment: it.sentiment,
    intents: it.enrichment.intents,
    text: [it.post.title, it.post.text].filter(Boolean).join(" — ").slice(0, 500),
  }));
  const counts = { total: items.length, shown: sample.length };
  try {
    const response = await client.beta.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Profile: ${profileName}\nPeriod: ${periodLabel}\nCounts: ${JSON.stringify(counts)}\nPosts:\n${JSON.stringify(sample)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`[summary] Claude ${error.status ?? "error"}: ${error.message}`);
      return null;
    }
    throw error;
  }
}
