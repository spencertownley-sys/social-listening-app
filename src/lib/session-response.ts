import { NextResponse } from "next/server";
import { sessionCookieFor } from "./accounts";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./auth";
import type { User } from "./store";

/**
 * Redirects use a relative Location: behind a proxy (Railway) `req.url` carries the internal host,
 * not the public one.
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

/** Only same-origin paths. */
export function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function signedIn(user: User, next: string): Promise<NextResponse> {
  const res = seeOther(next);
  const c = await sessionCookieFor(user);
  res.cookies.set(c.name, c.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export function signedOut(path = "/login"): NextResponse {
  const res = seeOther(path);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
