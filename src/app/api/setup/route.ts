import { AccountError, setupFirstAccount } from "@/lib/accounts";
import { seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /setup: create the first account (owner of the existing workspace). */
export async function POST(req: Request) {
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
