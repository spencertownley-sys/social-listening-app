import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found | Earshot", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className="mx-auto mt-12 max-w-md">
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted">There&apos;s nothing at this address. The link may be old, or the profile may have been deleted.</p>
        <Link href="/" className="btn">
          Back to your profiles
        </Link>
      </div>
    </div>
  );
}
