import { NextResponse } from "next/server";
import { removeMember } from "@/lib/accounts";
import { accountErrorResponse, apiContext, jsonBody } from "@/lib/http";

/** DELETE {userId} → remove someone from the workspace (owners only). */
export async function DELETE(req: Request) {
  const ctx = await apiContext("owner");
  if (ctx instanceof NextResponse) return ctx;
  const body = await jsonBody(req);
  try {
    await removeMember(ctx, String(body.userId ?? ""));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return accountErrorResponse(e);
  }
}
