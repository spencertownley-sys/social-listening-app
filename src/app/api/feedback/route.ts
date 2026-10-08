import { NextResponse } from "next/server";
import { errorResponse, jsonBody } from "@/lib/http";
import { recordFeedback } from "@/lib/profiles";
import { FEEDBACK_ACTIONS, SENTIMENTS, type FeedbackAction, type Sentiment } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await jsonBody(req);
    const action = body.action as FeedbackAction;
    if (!FEEDBACK_ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const corrected = body.correctedSentiment as Sentiment | undefined;
    if (corrected !== undefined && !SENTIMENTS.includes(corrected)) {
      return NextResponse.json({ error: "Unknown sentiment" }, { status: 400 });
    }
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
