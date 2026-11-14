import { AccountError, signupWithInvite } from "@/lib/accounts";
import { allowAuthAttempt } from "@/lib/rate-limit";
import { seeOther, signedIn } from "@/lib/session-response";

/** Form POST from /signup?invite=…: join the inviter's workspace. */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("invite") ?? "");
  const email = String(form.get("email") ?? "");
  const back = (message: string) => seeOther(`/signup?invite=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
  if (!allowAuthAttempt("signup", req, email)) return back("Too many attempts. Wait 15 minutes and try again.");
  try {
    const user = await signupWithInvite({
      token,
      email,
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    return signedIn(user, "/");
  } catch (e) {
    if (e instanceof AccountError) return back(e.message);
    throw e;
  }
}
