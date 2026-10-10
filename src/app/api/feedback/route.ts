import { NextResponse } from "next/server";
import { canSeeProfile } from "@/lib/accounts";
import { apiContext, errorResponse, jsonBody } from "@/lib/http";
import { read } from "@/lib/store";
import { recordFeedback } from "@/lib/profiles";
import { FEEDBACK_ACTIONS, SENTIMENTS, type FeedbackAction, type Sentiment } from "@/lib/types";

export async function POST(req: Request) {
  const ctx = await apiContext("write");
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await jsonBody(req);
    const action = body.action as FeedbackAction;
    if (!FEEDBACK_ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const corrected = body.correctedSentiment as Sentiment | undefined;
    if (corrected !== undefined && !SENTIMENTS.includes(corrected)) {
      return NextResponse.json({ error: "Unknown sentiment" }, { status: 400 });
    }
    if (!canSeeProfile(await read(), ctx, String(body.profileId ?? ""))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const feedback = await recordFeedback({
      profileId: String(body.profileId ?? ""),
      postId: String(body.postId ?? ""),
      action,
      correctedSentiment: corrected,
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
