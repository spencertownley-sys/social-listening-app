import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/accounts";
import { AuthCard, Field, FormError } from "@/components/AuthCard";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await needsSetup())) redirect("/login");
  const { error } = await searchParams;
  const needsCode = !!process.env.APP_PASSWORD || process.env.NODE_ENV === "production";
  return (
    <AuthCard
      title="Create the owner account"
      note="This first account owns the workspace and everything already in it. Invite others from your account page."
    >
      <form method="post" action="/api/setup" className="space-y-4">
        {needsCode ? (
          <Field label="Setup code (the site's current password)" type="password" name="setupCode" required autoFocus />
        ) : (
          <input type="hidden" name="setupCode" value="" />
        )}
        <Field label="Your name" name="name" autoComplete="name" required />
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
