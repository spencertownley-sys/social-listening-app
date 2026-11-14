import { currentContext, signOutEverywhere } from "@/lib/accounts";
import { signedOut } from "@/lib/session-response";

/**
 * Sign out: invalidate the session on the server (by bumping the user's session version), not just
 * the cookie, so a copied cookie stops working too. This signs the user out on every device.
 */
export async function POST() {
  const ctx = await currentContext();
  if (ctx) await signOutEverywhere(ctx);
  return signedOut();
}
