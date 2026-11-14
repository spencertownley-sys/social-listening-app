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

const LOCAL = "http://local.invalid";

/**
 * Only same-origin paths. Parsed the way browsers parse a Location header (WHATWG URL), which
 * strips tabs and newlines and treats backslashes as slashes, so tricks like "/\t/evil.com" can't
 * turn into "//evil.com".
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  let u: URL;
  try {
    u = new URL(raw, LOCAL);
  } catch {
    return "/";
  }
  if (u.origin !== LOCAL) return "/";
  const path = u.pathname + u.search + u.hash;
  // Dot segments can collapse to a protocol-relative path ("/a/..//evil.com" -> "//evil.com").
  return path.startsWith("//") || path.startsWith("/\\") ? "/" : path;
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
