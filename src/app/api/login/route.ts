import { login, needsSetup } from "@/lib/accounts";
import { allowAuthAttempt } from "@/lib/rate-limit";
import { safeNext, seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /login. */
export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  if (await needsSetup()) return seeOther("/setup");
  const email = String(form.get("email") ?? "");
  // Refused before the password is checked, so the limit also caps the hashing work.
  if (!allowAuthAttempt("login", req, email)) return seeOther(`/login?error=limit&next=${encodeURIComponent(next)}`);
  const user = await login(email, String(form.get("password") ?? ""));
  if (!user) {
    // Small fixed delay blunts password guessing.
    await new Promise((r) => setTimeout(r, 600));
    return seeOther(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  return signedIn(user, next);
}
