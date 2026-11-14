import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { UserError } from "../errors";
import { errorResponse } from "../http";

describe("errorResponse", () => {
  it("never sends internal error text to the browser", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error('connect ECONNREFUSED 10.0.0.5:5432 (relation "posts")'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe(JSON.stringify({ error: "Something went wrong" }));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps messages meant for the user", async () => {
    const res = errorResponse(new UserError("Profile not found", 404));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Profile not found" });
    const zod = z.object({ n: z.number() }).safeParse({ n: "x" });
    const bad = errorResponse(zod.error);
    expect(bad.status).toBe(400);
  });
});
