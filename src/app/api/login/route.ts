import { NextResponse } from "next/server";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

/**
 * Form POST from /login. Redirects back to `next` (same-origin paths only). Redirects use a
 * relative Location: behind a proxy (Railway) `req.url` carries the internal host, not the public one.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.startsWith("/\\") ? nextRaw : "/";
  if (!(await checkPassword(password))) {
    // Small fixed delay blunts password guessing.
    await new Promise((r) => setTimeout(r, 600));
    return seeOther(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const res = seeOther(next);
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
