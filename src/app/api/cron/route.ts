import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { runCycle } from "@/lib/scheduler";

export const maxDuration = 300;

/** External trigger for one listen + alert cycle: `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ run: await runCycle() });
}
