import { NextResponse } from "next/server";
import { draftProfile } from "@/lib/assist";
import { errorResponse, jsonBody } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    const description = typeof body.description === "string" ? body.description : "";
    if (!description.trim()) return NextResponse.json({ error: "Describe what you want to listen for." }, { status: 400 });
    return NextResponse.json(await draftProfile(description));
  } catch (e) {
    return errorResponse(e);
  }
}
