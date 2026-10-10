import { NextResponse } from "next/server";
import { visibleProfiles } from "@/lib/accounts";
import { apiContext, errorResponse, jsonBody } from "@/lib/http";
import { refreshProfileMatches } from "@/lib/pipeline";
import { createProfile } from "@/lib/profiles";
import { read } from "@/lib/store";

export async function GET() {
  const ctx = await apiContext();
  if (ctx instanceof NextResponse) return ctx;
  const data = await read();
  const counts = new Map<string, number>();
  for (const m of Object.values(data.matches)) counts.set(m.profileId, (counts.get(m.profileId) ?? 0) + 1);
  return NextResponse.json({ profiles: visibleProfiles(data, ctx).map((p) => ({ ...p, matchCount: counts.get(p.id) ?? 0 })) });
}

export async function POST(req: Request) {
  const ctx = await apiContext("write");
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await jsonBody(req);
    const profile = await createProfile(body.config, ctx.workspaceId);
    const matchCount = await refreshProfileMatches(profile.id);
    return NextResponse.json({ profile, matchCount }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
