import { redirect } from "next/navigation";
import { currentContext, needsSetup } from "@/lib/accounts";
import { AuthCard, Field, FormError } from "@/components/AuthCard";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await needsSetup()) redirect("/setup");
  if (await currentContext()) redirect("/");
  const { next = "/", error } = await searchParams;
  return (
    <AuthCard title="Sign in to Earshot" note="New here? Ask someone in your workspace for an invite link.">
      <form method="post" action="/api/login" className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" type="email" name="email" autoComplete="email" required autoFocus />
        <Field label="Password" type="password" name="password" autoComplete="current-password" required />
        <FormError message={error ? "That email and password didn't match." : undefined} />
        <button className="btn-primary w-full justify-center" type="submit">
          Sign in
        </button>
      </form>
    </AuthCard>
  );
}
