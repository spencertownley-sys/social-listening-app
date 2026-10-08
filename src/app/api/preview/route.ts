import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/http";
import { previewProfile } from "@/lib/pipeline";
import { parseProfileConfig } from "@/lib/profile";

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    const config = parseProfileConfig(body.config);
    const now = new Date().toISOString();
    const results = await previewProfile({
      id: `preview_${Date.now()}`,
      workspaceId: "preview",
      version: 0,
      status: "active",
      config,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
