import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claudeEnabled } from "./enrich/claude";
import { fold } from "./query";
import { INTENTS, SENTIMENTS } from "./types";

/**
 * Builder step 1: "What do you want to listen for?" Free text in, a draft of keywords,
 * exclusions and a semantic topic out. Uses the larger model (PRD: profile drafting), with a
 * heuristic fallback so the builder works without an API key.
 */

export const ASSIST_MODEL = process.env.ASSIST_MODEL ?? "claude-opus-5-5";

export const DraftSchema = z.object({
  name: z.string().describe("Short profile name, under 40 characters"),
  any: z.array(z.string()).describe("Keywords, brand names, nicknames, common misspellings, #hashtags, @handles"),
  exclude: z.array(z.string()).describe("Words or phrases that would bring in irrelevant posts"),
  semantic: z.string().describe("One sentence describing the conversation, matched by meaning"),
  sentiment_keep: z.array(z.enum(SENTIMENTS)).describe("Which tones to keep; all four if the user didn't say"),
  intents: z.array(z.enum(INTENTS)).describe("Intents to filter for; empty unless the user asked for specific kinds of posts"),
  competitors: z.array(z.string()).describe("Competitors the user named, if any"),
});
export type ProfileDraft = z.infer<typeof DraftSchema>;

const SYSTEM = `You help people set up a social listening profile. They describe what they want to hear about in plain English; you draft the profile.
Guidelines:
- "any" holds 3-12 search terms: the exact names, plus nicknames, common misspellings, relevant #hashtags and @handles. Put multi-word names in plain form (e.g. Royal Caribbean); the system treats them as phrases.
- "exclude" holds terms that would cause false matches (homonyms, job posts, giveaways), not things the user cares about.
- Only restrict sentiment or intents when the user asked for that (e.g. "only complaints", "people asking for recommendations").
- Keep it to public conversation. If the request targets a private individual rather than a brand, product, public figure, or topic, draft a profile about the topic instead and leave their name out.`;

let client: Anthropic | null = null;

export async function draftProfile(description: string): Promise<{ draft: ProfileDraft; source: "claude" | "heuristic" }> {
  const text = description.trim().slice(0, 2000);
  if (!text) throw new Error("Describe what you want to listen for.");
  if (!claudeEnabled()) return { draft: heuristicDraft(text), source: "heuristic" };

  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: ASSIST_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { draft: heuristicDraft(text), source: "heuristic" };
    }
    return { draft: response.parsed_output, source: "claude" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`[assist] Claude ${error.status ?? "error"}: ${error.message}; using heuristic draft`);
      return { draft: heuristicDraft(text), source: "heuristic" };
    }
    throw error;
  }
}

const STOP = new Set(
  (
    "a an the and or but of for to in on at by with about from into over what when where who how why want wants " +
    "i me my we our us you your tell let know hear listen listening posts post people saying say says talk talking " +
    "mentions mention anything everything any all only just show find track monitor watch online social media " +
    "is are be been it its that this these those them they there their please would like also especially"
  ).split(" "),
);

/** Offline drafting: pull quoted strings, #tags, @handles, Capitalized Names, then key words. */
export function heuristicDraft(text: string): ProfileDraft {
  const terms: string[] = [];
  const push = (t: string) => {
    const clean = t.trim().replace(/[.,;:!?]+$/, "");
    if (clean && !terms.some((x) => fold(x) === fold(clean))) terms.push(clean);
  };
  for (const m of text.matchAll(/"([^"]+)"|“([^”]+)”/g)) push(m[1] ?? m[2]);
  for (const m of text.matchAll(/[#@][\w.]+/g)) push(m[0]);
  // Quoted names, tags and handles are explicit; only guess further terms when there are none.
  const explicit = terms.length > 0;
  if (!explicit) for (const m of text.matchAll(/\b([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*)*)/g)) {
    const name = m[1];
    if (!STOP.has(name.toLowerCase()) && !/^(I|I'm|Only|Tell|Show|Find|Let)$/.test(name)) push(name);
  }
  if (terms.length === 0) {
    for (const w of fold(text).match(/[\p{L}\p{N}]{4,}/gu) ?? []) {
      if (!STOP.has(w)) push(w);
      if (terms.length >= 6) break;
    }
  }

  const lower = fold(text);
  let sentiment_keep: ProfileDraft["sentiment_keep"] = [...SENTIMENTS];
  if (/\b(complain\w*|negative|angry|upset|bad reviews?|problems?)\b/.test(lower)) sentiment_keep = ["negative", "mixed"];
  else if (/\b(positive|happy|praise|fans?|love|reshare)\b/.test(lower)) sentiment_keep = ["positive", "mixed"];

  const intents: ProfileDraft["intents"] = [];
  if (/\b(recommend|suggestion|looking for|leads?)\b/.test(lower)) intents.push("recommendation_request");
  if (/\bquestions?\b/.test(lower)) intents.push("question");
  if (/\bcomplain|complaints\b/.test(lower)) intents.push("complaint");
  if (/\b(feature requests?|bugs?)\b/.test(lower)) intents.push("feature_request");
  if (/\bchurn|cancel/.test(lower)) intents.push("churn_risk");

  // "complaints or recommendation requests" is an OR; filtering on negative tone too would hide the requests.
  if (intents.some((i) => i !== "complaint")) sentiment_keep = [...SENTIMENTS];

  const competitors: string[] = [];
  const comp = /competitors?\s*(?:like|such as|:)?\s*([^.]+)/i.exec(text);
  if (comp) for (const c of comp[1].split(/,|\band\b|\bor\b/)) if (c.trim()) competitors.push(c.trim());

  return {
    name: (terms[0] ?? "My profile").slice(0, 40),
    any: terms.slice(0, 12),
    exclude: [],
    semantic: text.length <= 200 ? text : text.slice(0, 197) + "...",
    sentiment_keep,
    intents,
    competitors,
  };
}
