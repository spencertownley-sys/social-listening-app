import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/http";
import { refreshProfileMatches } from "@/lib/pipeline";
import { createProfile } from "@/lib/profiles";
import { read } from "@/lib/store";

export async function GET() {
  const data = await read();
  const counts = new Map<string, number>();
  for (const m of Object.values(data.matches)) counts.set(m.profileId, (counts.get(m.profileId) ?? 0) + 1);
  return NextResponse.json({ profiles: data.profiles.map((p) => ({ ...p, matchCount: counts.get(p.id) ?? 0 })) });
}

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    const profile = await createProfile(body.config);
    const matchCount = await refreshProfileMatches(profile.id);
    return NextResponse.json({ profile, matchCount }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
