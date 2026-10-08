import { fold } from "./query";

/**
 * Layer 4 ("describe it in a sentence") for the MVP: the topic sentence is reduced to its key
 * content words (light stemming), and a post matches when enough of them appear. Embeddings +
 * pgvector replace this later; the interface (`semanticMatch`) stays the same.
 */

const STOP = new Set(
  (
    "a an the and or but of for to in on at by with about from into over under is are was were be been being " +
    "people person someone anyone everyone users user who what when where which how why that this these those " +
    "their them they it its talking talk discussing saying says posts post mention mentions things stuff " +
    "really very just about also any some more most other than then there here i me my we our you your " +
    "want wants like likes get gets got having have has do does did can could would should will"
  ).split(" "),
);

export function stem(word: string): string {
  let w = word;
  for (const suf of ["ations", "ation", "ingly", "ments", "ment", "ness", "ings", "ing", "edly", "ies", "ied", "ers", "er", "ed", "es", "ly", "s"]) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      if (suf === "ies" || suf === "ied") w += "y";
      break;
    }
  }
  return w;
}

export function keyStems(sentence: string): string[] {
  const out: string[] = [];
  for (const w of fold(sentence).match(/[\p{L}\p{N}-]+/gu) ?? []) {
    const parts = w.includes("-") ? [w.replace(/-/g, ""), ...w.split("-")] : [w];
    for (const p of parts) {
      if (p.length < 3 || STOP.has(p)) continue;
      const s = stem(p);
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

export function semanticMatch(sentence: string, docTokens: string[]): { ok: boolean; matched: string[] } {
  const keys = keyStems(sentence);
  if (keys.length === 0) return { ok: false, matched: [] };
  const docStems = new Set(docTokens.flatMap((t) => [stem(t), stem(t.replace(/-/g, ""))]));
  const matched = keys.filter((k) => docStems.has(k));
  const needed = keys.length <= 2 ? keys.length : Math.max(2, Math.ceil(keys.length * 0.6));
  return { ok: matched.length >= needed, matched };
}
