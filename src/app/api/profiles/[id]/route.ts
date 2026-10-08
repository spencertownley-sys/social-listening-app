import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/http";
import { refreshProfileMatches } from "@/lib/pipeline";
import { deleteProfile, updateProfile } from "@/lib/profiles";
import { read } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const data = await read();
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const versions = data.versions.filter((v) => v.profileId === id).sort((a, b) => b.version - a.version);
  return NextResponse.json({ profile, versions });
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await jsonBody(req);
    const status = body.status === "active" || body.status === "paused" ? body.status : undefined;
    const rollbackTo = typeof body.rollbackTo === "number" ? body.rollbackTo : undefined;
    const profile = await updateProfile(id, { config: body.config, status, rollbackTo });
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const matchCount = await refreshProfileMatches(id);
    return NextResponse.json({ profile, matchCount });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return (await deleteProfile(id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
