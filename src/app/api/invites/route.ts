import { NextResponse } from "next/server";
import { createInvite, revokeInvite } from "@/lib/accounts";
import { accountErrorResponse, apiContext, jsonBody } from "@/lib/http";
import type { Role } from "@/lib/store";

/** POST {role} → a single-use invite link (7 days). DELETE {id} → revoke. */
export async function POST(req: Request) {
  const ctx = await apiContext("write");
  if (ctx instanceof NextResponse) return ctx;
  const body = await jsonBody(req);
  const role: Role = body.role === "owner" || body.role === "viewer" ? body.role : "editor";
  try {
    const { token, invite } = await createInvite(ctx, role);
    return NextResponse.json({ path: `/signup?invite=${token}`, expiresAt: invite.expiresAt, role }, { status: 201 });
  } catch (e) {
    return accountErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const ctx = await apiContext("write");
  if (ctx instanceof NextResponse) return ctx;
  const body = await jsonBody(req);
  try {
    await revokeInvite(ctx, String(body.id ?? ""));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return accountErrorResponse(e);
  }
}
