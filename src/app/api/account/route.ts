import { NextResponse } from "next/server";
import { accountErrorResponse, apiContext, jsonBody } from "@/lib/http";
import { changePassword, sessionCookieFor, signOutEverywhere } from "@/lib/accounts";
import { SESSION_MAX_AGE } from "@/lib/auth";

/**
 * POST {action: "password", current, next} → change password (signs out other devices, keeps this one)
 * POST {action: "signout-everywhere"} → invalidate every session, including this one
 */
export async function POST(req: Request) {
  const ctx = await apiContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await jsonBody(req);
  try {
    if (body.action === "password") {
      const user = await changePassword(ctx, String(body.current ?? ""), String(body.next ?? ""));
      const res = NextResponse.json({ ok: true });
      const c = await sessionCookieFor(user);
      res.cookies.set(c.name, c.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
      return res;
    }
    if (body.action === "signout-everywhere") {
      await signOutEverywhere(ctx);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return accountErrorResponse(e);
  }
}
