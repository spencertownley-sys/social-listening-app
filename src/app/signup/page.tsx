import Link from "next/link";
import { findInvite } from "@/lib/accounts";
import { read } from "@/lib/store";
import { AuthCard, Field, FormError } from "@/components/AuthCard";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; error?: string }> }) {
  const { invite: token = "", error } = await searchParams;
  const data = await read();
  const invite = token ? findInvite(data, token) : null;
  const workspace = invite ? data.workspaces.find((w) => w.id === invite.workspaceId) : null;
  if (!invite) {
    return (
      <AuthCard title="This invite link doesn't work" note={<Link href="/login" className="text-accent hover:underline">Go to sign in</Link>}>
        <p className="text-sm text-muted">It may have expired (links last 7 days) or already been used. Ask for a new one.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Join ${workspace?.name ?? "the workspace"}`} note={`You'll join as ${invite.role === "viewer" ? "a viewer (read-only)" : `an ${invite.role}`}.`}>
      <form method="post" action="/api/signup" className="space-y-4">
        <input type="hidden" name="invite" value={token} />
        <Field label="Your name" name="name" autoComplete="name" required autoFocus />
        <Field label="Email" type="email" name="email" autoComplete="email" required />
        <Field label="Password (10+ characters)" type="password" name="password" autoComplete="new-password" minLength={10} required />
        <FormError message={error} />
        <button className="btn-primary w-full justify-center" type="submit">
          Create account
        </button>
      </form>
    </AuthCard>
  );
}
