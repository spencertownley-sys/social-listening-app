import { describe, expect, it } from "vitest";
import { compileTerm, evaluate, makeDoc, parseQuery, validateQuery } from "../query";

const doc = (text: string, links: string[] = []) => makeDoc({ text, links });
const q = (query: string, text: string, links?: string[]) => evaluate(parseQuery(query), doc(text, links)).ok;

describe("query language", () => {
  it("handles implicit AND, OR and NOT", () => {
    expect(q("cruise wifi", "The cruise wifi was slow")).toBe(true);
    expect(q("cruise wifi", "The cruise was great")).toBe(false);
    expect(q("cruise OR ferry", "Took the ferry")).toBe(true);
    expect(q("wifi NOT starlink", "Starlink wifi is great")).toBe(false);
    expect(q("wifi -starlink", "wifi was bad")).toBe(true);
  });

  it("respects grouping", () => {
    expect(q("(carnival OR princess) AND refund", "Princess gave me a refund")).toBe(true);
    expect(q("(carnival OR princess) AND refund", "Royal gave me a refund")).toBe(false);
  });

  it("matches exact phrases, accents and curly quotes", () => {
    expect(q('"royal caribbean"', "Sailing Royal Caribbean next week")).toBe(true);
    expect(q('"royal caribbean"', "Caribbean royal family")).toBe(false);
    expect(q("“café olé”", "Loved Cafe Ole today")).toBe(true);
  });

  it("supports NEAR/n proximity", () => {
    expect(q("wifi NEAR/3 slow", "wifi on deck was slow")).toBe(true);
    expect(q("wifi NEAR/2 slow", "the wifi on the pool deck was painfully slow")).toBe(false);
  });

  it("supports hashtags, mentions, domains and prefixes", () => {
    expect(q("#cruise", "Day 3 #cruise")).toBe(true);
    expect(q("#cruise", "my cruise")).toBe(false);
    expect(q("cruise", "Day 3 #cruise")).toBe(true); // a bare word also finds its hashtag
    expect(q("@deependpod", "love @deependpod")).toBe(true);
    expect(q("domain:example.com", "read this", ["https://www.example.com/a"])).toBe(true);
    expect(q("cruis*", "cruising soon")).toBe(true);
  });

  it("reports syntax errors with a position", () => {
    expect(validateQuery("(cruise OR ship")).toMatchObject({ ok: false });
    expect(validateQuery('"open quote')).toMatchObject({ ok: false });
    expect(validateQuery("cruise OR")).toMatchObject({ ok: false });
    expect(validateQuery("cruise OR ship")).toEqual({ ok: true });
  });

  it("treats plain multi-word list entries as phrases", () => {
    const t = compileTerm("Bean There Coffee");
    expect(evaluate(t, doc("Bean There Coffee on Alberta")).ok).toBe(true);
    expect(evaluate(t, doc("There is coffee and a bean")).ok).toBe(false);
  });

  it("returns the labels that matched for explanations", () => {
    expect(evaluate(parseQuery("carnival OR princess"), doc("Princess and Carnival")).hits).toEqual(["carnival", "princess"]);
  });
});
