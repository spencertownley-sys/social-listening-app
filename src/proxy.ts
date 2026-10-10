import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth";

/**
 * First gate: every page and API route needs a validly signed, unexpired session cookie, except
 * the sign-in/setup/sign-up pages and the health and cron endpoints. Pages and routes then check
 * the session against the user's current account (accounts.ts).
 */
const PUBLIC = ["/login", "/setup", "/signup", "/api/login", "/api/setup", "/api/signup", "/api/health", "/api/cron"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
