import { login, needsSetup } from "@/lib/accounts";
import { safeNext, seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /login. */
export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  if (await needsSetup()) return seeOther("/setup");
  const user = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!user) {
    // Small fixed delay blunts password guessing.
    await new Promise((r) => setTimeout(r, 600));
    return seeOther(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  return signedIn(user, next);
}
