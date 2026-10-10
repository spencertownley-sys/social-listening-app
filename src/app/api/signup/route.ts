import { AccountError, signupWithInvite } from "@/lib/accounts";
import { seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /signup?invite=…: join the inviter's workspace. */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("invite") ?? "");
  try {
    const user = await signupWithInvite({
      token,
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    return signedIn(user, "/");
  } catch (e) {
    if (e instanceof AccountError) return seeOther(`/signup?invite=${encodeURIComponent(token)}&error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
