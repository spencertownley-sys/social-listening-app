import { NextResponse } from "next/server";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

/** Form POST from /login. Redirects back to `next` (same-origin paths only). */
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const base = new URL(req.url);
  if (!(await checkPassword(password))) {
    // Small fixed delay blunts password guessing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, base), 303);
  }
  const res = NextResponse.redirect(new URL(next, base), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: base.protocol === "https:" || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
