import { NextResponse } from "next/server";
import { AccountError, needsSetup, setupFirstAccount } from "@/lib/accounts";
import { clientIp, setupLimiter } from "@/lib/rate-limit";
import { seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /setup: create the first account (owner of the existing workspace). */
export async function POST(req: Request) {
  // Throttle before anything else so the setup code can't be guessed at speed.
  const limit = setupLimiter.hit(clientIp(req));
  if (!limit.ok) {
    return new NextResponse("Too many setup attempts. Wait 15 minutes and try again.", {
      status: 429,
      headers: { "retry-after": String(limit.retryAfter), "content-type": "text/plain; charset=utf-8" },
    });
  }
  // Once the site has an account, this endpoint stops answering setup requests.
  if (!(await needsSetup())) return seeOther("/login");
  const form = await req.formData();
  try {
    const user = await setupFirstAccount({
      setupCode: String(form.get("setupCode") ?? ""),
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    return signedIn(user, "/");
  } catch (e) {
    if (e instanceof AccountError) return seeOther(`/setup?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
