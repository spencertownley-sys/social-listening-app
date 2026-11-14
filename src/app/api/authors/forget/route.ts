import { NextResponse } from "next/server";
import { z } from "zod";
import { forgetAuthor } from "@/lib/forget";
import { apiContext, errorResponse, jsonBody } from "@/lib/http";
import { DEFAULT_WORKSPACE_ID, mutate } from "@/lib/store";
import { NETWORKS } from "@/lib/types";

const Body = z.object({
  network: z.enum(NETWORKS),
  handle: z.string().trim().min(1).max(200),
});

/**
 * POST {network, handle} → erase everything stored about one post author (an erasure request).
 * Posts sit in one pool shared by every profile, so only owners of the site's main workspace can.
 */
export async function POST(req: Request) {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.memberships.some((m) => m.workspaceId === DEFAULT_WORKSPACE_ID && m.role === "owner")) {
    return NextResponse.json({ error: "Only the site's owners can erase an author's data." }, { status: 403 });
  }
  try {
    const { network, handle } = Body.parse(await jsonBody(req));
    const result = await mutate((data) => forgetAuthor(data, network, handle));
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
