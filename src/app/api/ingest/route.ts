import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/http";
import { runIngest } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    const sinceHours = typeof body.sinceHours === "number" ? Math.min(24 * 7, Math.max(1, body.sinceHours)) : undefined;
    return NextResponse.json({ run: await runIngest({ demo: body.demo === true, sinceHours }) });
  } catch (e) {
    return errorResponse(e);
  }
}
