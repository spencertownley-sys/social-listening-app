import { signedOut } from "@/lib/session-response";

export async function POST() {
  return signedOut();
}
