/**
 * Boolean query language for "What to hear" (PRD layer 3).
 *
 *   cruise wifi                 implicit AND
 *   cruise OR ship              OR (also `|`)
 *   wifi NOT starlink           NOT (also a leading `-`)
 *   "royal caribbean"           exact phrase
 *   wifi NEAR/5 slow            both within 5 words of each other
 *   #cruisetok  @handle         hashtag / mention (a bare word also matches its hashtag)
 *   domain:example.com          link to a domain
 *   cruis*                      prefix wildcard
 *   ( ... )                     grouping
 *
 * Keyword-list entries (profile `match.any` / `all` / `exclude`) go through `compileTerm`, which
 * treats a plain multi-word entry such as `Royal Caribbean` as a phrase rather than an AND.
 */

export type Atom =
  | { type: "word"; value: string; prefix: boolean }
  | { type: "phrase"; words: string[] }
  | { type: "hashtag"; value: string }
  | { type: "mention"; value: string }
  | { type: "domain"; value: string };

export type QueryNode =
  | { type: "atom"; atom: Atom; label: string }
  | { type: "and"; children: QueryNode[] }
  | { type: "or"; children: QueryNode[] }
  | { type: "not"; child: QueryNode }
  | { type: "near"; left: QueryNode & { type: "atom" }; right: QueryNode & { type: "atom" }; distance: number };

export class QuerySyntaxError extends Error {
  constructor(message: string, public position: number) {
    super(message);
    this.name = "QuerySyntaxError";
  }
}

// ---------------------------------------------------------------------------------------------
// Text normalization shared by queries and documents

export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

function words(s: string): string[] {
  // Possessives match their base word ("Notably's" -> "notably"); other contractions stay whole.
  return (fold(s).match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? []).map((w) => w.replace(/'s$/, ""));
}

// ---------------------------------------------------------------------------------------------
// Tokenizer

type Tok =
  | { t: "lparen" | "rparen" | "and" | "or" | "not"; pos: number }
  | { t: "near"; n: number; pos: number }
  | { t: "atom"; atom: Atom; label: string; pos: number; negated?: boolean };

function atomFromBare(raw: string): Atom | null {
  const lower = fold(raw);
  if (lower.startsWith("#") && lower.length > 1) return { type: "hashtag", value: lower.slice(1) };
  if (lower.startsWith("@") && lower.length > 1) return { type: "mention", value: lower.slice(1).replace(/^@/, "") };
  if (lower.startsWith("domain:") && lower.length > 7)
    return { type: "domain", value: lower.slice(7).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") };
  const prefix = lower.endsWith("*");
  const ws = words(prefix ? lower.slice(0, -1) : lower);
  if (ws.length === 0) return null;
  if (ws.length > 1) return { type: "phrase", words: ws };
  return { type: "word", value: ws[0], prefix };
}

function tokenize(q: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lparen", pos: i++ });
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rparen", pos: i++ });
      continue;
    }
    if (c === "|") {
      toks.push({ t: "or", pos: i++ });
      continue;
    }
    let negated = false;
    let start = i;
    if (c === "-" && i + 1 < q.length && !/\s/.test(q[i + 1])) {
      negated = true;
      i++;
      start = i;
    }
    if (q[i] === '"' || q[i] === "“") {
      const close = q.slice(i + 1).search(/["”]/);
      if (close < 0) throw new QuerySyntaxError("Unclosed quote", i);
      const inner = q.slice(i + 1, i + 1 + close);
      const ws = words(inner);
      i = i + close + 2;
      if (ws.length === 0) continue;
      const atom: Atom = ws.length === 1 ? { type: "word", value: ws[0], prefix: false } : { type: "phrase", words: ws };
      toks.push({ t: "atom", atom, label: `"${inner.trim()}"`, pos: start, negated });
      continue;
    }
    let j = i;
    while (j < q.length && !/[\s()|]/.test(q[j])) j++;
    const raw = q.slice(i, j);
    i = j;
    if (!negated) {
      if (raw === "AND" || raw === "&&") {
        toks.push({ t: "and", pos: start });
        continue;
      }
      if (raw === "OR") {
        toks.push({ t: "or", pos: start });
        continue;
      }
      if (raw === "NOT") {
        toks.push({ t: "not", pos: start });
        continue;
      }
      const near = /^NEAR(?:\/(\d+))?$/.exec(raw);
      if (near) {
        toks.push({ t: "near", n: near[1] ? parseInt(near[1], 10) : 5, pos: start });
        continue;
      }
    }
    const atom = atomFromBare(raw);
    if (atom) toks.push({ t: "atom", atom, label: raw, pos: start, negated });
  }
  return toks;
}

// ---------------------------------------------------------------------------------------------
// Parser (recursive descent)

export function parseQuery(q: string): QueryNode {
  const toks = tokenize(q);
  let p = 0;
  const peek = () => toks[p];

  function parseOr(): QueryNode {
    const children = [parseAnd()];
    while (peek()?.t === "or") {
      p++;
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  function parseAnd(): QueryNode {
    const children = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t || t.t === "or" || t.t === "rparen") break;
      if (t.t === "and") p++;
      children.push(parseNot());
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  function parseNot(): QueryNode {
    const t = peek();
    if (t?.t === "not") {
      p++;
      return { type: "not", child: parseNot() };
    }
    return parsePrimary();
  }

  function parsePrimary(): QueryNode {
    const t = peek();
    if (!t) throw new QuerySyntaxError("Query ends too early", q.length);
    if (t.t === "lparen") {
      p++;
      const inner = parseOr();
      if (peek()?.t !== "rparen") throw new QuerySyntaxError("Missing closing parenthesis", t.pos);
      p++;
      return inner;
    }
    if (t.t !== "atom") throw new QuerySyntaxError(`Unexpected ${t.t.toUpperCase()}`, t.pos);
    p++;
    const node: QueryNode & { type: "atom" } = { type: "atom", atom: t.atom, label: t.label };
    const next = peek();
    if (next?.t === "near") {
      p++;
      const right = peek();
      if (!right || right.t !== "atom") throw new QuerySyntaxError("NEAR needs a word or phrase on both sides", next.pos);
      p++;
      const near: QueryNode = {
        type: "near",
        left: node,
        right: { type: "atom", atom: right.atom, label: right.label },
        distance: next.n,
      };
      return t.negated ? { type: "not", child: near } : near;
    }
    return t.negated ? { type: "not", child: node } : node;
  }

  if (toks.length === 0) throw new QuerySyntaxError("Empty query", 0);
  const root = parseOr();
  if (p < toks.length) throw new QuerySyntaxError("Unexpected closing parenthesis", toks[p].pos);
  return root;
}

/** Compile one keyword-list entry. Plain multi-word entries are phrases; anything with syntax is parsed. */
export function compileTerm(entry: string): QueryNode {
  const hasSyntax = /["()|]|\bAND\b|\bOR\b|\bNOT\b|\bNEAR\b|(^|\s)-\S/.test(entry);
  if (hasSyntax) return parseQuery(entry);
  const atom = atomFromBare(entry.trim());
  if (!atom) throw new QuerySyntaxError("Empty term", 0);
  return { type: "atom", atom, label: entry.trim() };
}

/** Validate without throwing; for the advanced editor. */
export function validateQuery(q: string): { ok: true } | { ok: false; error: string; position: number } {
  try {
    parseQuery(q);
    return { ok: true };
  } catch (e) {
    if (e instanceof QuerySyntaxError) return { ok: false, error: e.message, position: e.position };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Documents and evaluation

export interface QueryDoc {
  tokens: string[];
  tokenSet: Set<string>;
  hashtags: Set<string>;
  mentions: Set<string>;
  domains: Set<string>;
}

export function makeDoc(input: { text: string; title?: string; links?: string[]; authorHandle?: string }): QueryDoc {
  const full = [input.title ?? "", input.text].join("\n");
  const folded = fold(full);
  const tokens = words(full);
  const hashtags = new Set((folded.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.slice(1)));
  const mentions = new Set((folded.match(/@[\p{L}\p{N}_.-]+/gu) ?? []).map((m) => m.slice(1).replace(/\.$/, "")));
  const domains = new Set<string>();
  const urls = [...(input.links ?? []), ...(full.match(/https?:\/\/[^\s)]+/g) ?? [])];
  for (const u of urls) {
    try {
      domains.add(new URL(u).hostname.replace(/^www\./, "").toLowerCase());
    } catch {
      /* ignore malformed */
    }
  }
  return { tokens, tokenSet: new Set(tokens), hashtags, mentions, domains };
}

function atomPositions(atom: Atom, doc: QueryDoc): number[] {
  switch (atom.type) {
    case "word": {
      const out: number[] = [];
      doc.tokens.forEach((t, i) => {
        if (atom.prefix ? t.startsWith(atom.value) : t === atom.value) out.push(i);
      });
      return out;
    }
    case "phrase": {
      const out: number[] = [];
      const n = atom.words.length;
      for (let i = 0; i + n <= doc.tokens.length; i++) {
        let ok = true;
        for (let k = 0; k < n; k++)
          if (doc.tokens[i + k] !== atom.words[k]) {
            ok = false;
            break;
          }
        if (ok) out.push(i);
      }
      return out;
    }
    default:
      return [];
  }
}

function atomMatches(atom: Atom, doc: QueryDoc): boolean {
  switch (atom.type) {
    case "word":
      if (!atom.prefix) return doc.tokenSet.has(atom.value);
      for (const t of doc.tokenSet) if (t.startsWith(atom.value)) return true;
      return false;
    case "phrase":
      return atomPositions(atom, doc).length > 0;
    case "hashtag":
      return doc.hashtags.has(atom.value);
    case "mention":
      return doc.mentions.has(atom.value);
    case "domain":
      for (const d of doc.domains) if (d === atom.value || d.endsWith("." + atom.value)) return true;
      return false;
  }
}

export interface EvalResult {
  ok: boolean;
  /** Labels of the positive atoms that contributed to a match (for "why this matched"). */
  hits: string[];
}

export function evaluate(node: QueryNode, doc: QueryDoc): EvalResult {
  switch (node.type) {
    case "atom":
      return atomMatches(node.atom, doc) ? { ok: true, hits: [node.label] } : { ok: false, hits: [] };
    case "and": {
      const hits: string[] = [];
      for (const c of node.children) {
        const r = evaluate(c, doc);
        if (!r.ok) return { ok: false, hits: [] };
        hits.push(...r.hits);
      }
      return { ok: true, hits };
    }
    case "or": {
      const hits: string[] = [];
      let ok = false;
      for (const c of node.children) {
        const r = evaluate(c, doc);
        if (r.ok) {
          ok = true;
          hits.push(...r.hits);
        }
      }
      return { ok, hits: ok ? hits : [] };
    }
    case "not":
      return { ok: !evaluate(node.child, doc).ok, hits: [] };
    case "near": {
      const a = atomPositions(node.left.atom, doc);
      const b = atomPositions(node.right.atom, doc);
      const lenA = node.left.atom.type === "phrase" ? node.left.atom.words.length : 1;
      const lenB = node.right.atom.type === "phrase" ? node.right.atom.words.length : 1;
      for (const i of a)
        for (const j of b) {
          // Number of words between the two sides.
          const gap = j >= i ? j - (i + lenA) : i - (j + lenB);
          if (gap <= node.distance) return { ok: true, hits: [`${node.left.label} near ${node.right.label}`] };
        }
      return { ok: false, hits: [] };
    }
  }
}

/** Every positive word/phrase/tag in a query; the pre-filter uses these to skip obvious misses cheaply. */
export function positiveAtoms(node: QueryNode, negated = false): Atom[] {
  switch (node.type) {
    case "atom":
      return negated ? [] : [node.atom];
    case "and":
    case "or":
      return node.children.flatMap((c) => positiveAtoms(c, negated));
    case "not":
      return positiveAtoms(node.child, !negated);
    case "near":
      return negated ? [] : [node.left.atom, node.right.atom];
  }
}

/** Search-API friendly strings for connectors (Bluesky/YouTube search take plain keyword strings). */
export function atomToSearchString(atom: Atom): string {
  switch (atom.type) {
    case "word":
      return atom.value;
    case "phrase":
      return `"${atom.words.join(" ")}"`;
    case "hashtag":
      return `#${atom.value}`;
    case "mention":
      return `@${atom.value}`;
    case "domain":
      return atom.value;
  }
}
