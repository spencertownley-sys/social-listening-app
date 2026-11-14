"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card space-y-3" role="alert">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted">
          This page couldn&apos;t load. Try again, and if it keeps happening, let whoever runs Earshot know
          {error.digest ? ` (reference ${error.digest})` : ""}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn">
            Back to your profiles
          </Link>
        </div>
      </div>
    </div>
  );
}
