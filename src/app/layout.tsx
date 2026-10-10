import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { authEnabled, isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { read } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earshot — social listening",
  description: "Social listening you set up in five minutes and tune like a playlist.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  const unread = signedIn ? (await read()).notifications.filter((n) => !n.read).length : 0;
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Earshot
            </Link>
            {signedIn && (
              <>
                <Link href="/" className="text-sm text-muted hover:text-foreground">
                  Profiles
                </Link>
                <Link href="/profiles/new" className="text-sm text-muted hover:text-foreground">
                  New profile
                </Link>
                <Link href="/notifications" className="text-sm text-muted hover:text-foreground">
                  Notifications
                  {unread > 0 && (
                    <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-ink" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </Link>
                {authEnabled() && (
                  <form method="post" action="/api/logout" className="ml-auto">
                    <button className="text-sm text-muted hover:text-foreground" type="submit">
                      Sign out
                    </button>
                  </form>
                )}
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
