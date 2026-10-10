import { NextResponse } from "next/server";
import { apiContext, errorResponse, jsonBody } from "@/lib/http";
import { runIngest } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    // Demo posts go into the shared pool everyone's profiles match against, so only owners load them.
    const ctx = await apiContext(body.demo === true ? "owner" : "write");
    if (ctx instanceof NextResponse) return ctx;
    const sinceHours = typeof body.sinceHours === "number" ? Math.min(24 * 7, Math.max(1, body.sinceHours)) : undefined;
    return NextResponse.json({ run: await runIngest({ demo: body.demo === true, sinceHours }) });
  } catch (e) {
    return errorResponse(e);
  }
}
