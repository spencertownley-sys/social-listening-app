import { describe, expect, it } from "vitest";
import { safeNext } from "../session-response";

function sameOrigin(path: string): boolean {
  return new URL(path, "https://earshot.example").origin === "https://earshot.example";
}

describe("safeNext", () => {
  it("keeps ordinary paths", () => {
    expect(safeNext("/profiles/1?x=1")).toBe("/profiles/1?x=1");
    expect(safeNext("/profiles/1#feed")).toBe("/profiles/1#feed");
    expect(safeNext("/")).toBe("/");
  });

  it("never sends anyone to another site", () => {
    const attempts = ["/%09/evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "/a/..//evil.com", "/./\t/evil.com", "javascript:alert(1)", " /x"];
    for (const raw of attempts) {
      const next = safeNext(raw);
      expect(next.startsWith("/"), raw).toBe(true);
      expect(sameOrigin(next), `${JSON.stringify(raw)} -> ${next}`).toBe(true);
      expect(next.startsWith("//"), raw).toBe(false);
    }
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
  });

  it("falls back to / for anything that isn't a string", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(42)).toBe("/");
  });
});
