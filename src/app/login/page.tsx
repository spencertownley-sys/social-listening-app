export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <form method="post" action="/api/login" className="card space-y-4">
        <h1 className="text-xl font-semibold">Sign in to Earshot</h1>
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {error && (
          <p className="text-sm text-danger" role="alert">
            That password didn&apos;t match.
          </p>
        )}
        <button className="btn-primary w-full justify-center" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
