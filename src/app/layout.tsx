import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { currentContext, visibleProfiles } from "@/lib/accounts";
import { read } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earshot — social listening",
  description: "Social listening you set up in five minutes and tune like a playlist.",
  // Private tool: keep the sign-in and setup pages out of search results.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await currentContext();
  const signedIn = !!ctx;
  let unread = 0;
  if (ctx) {
    const data = await read();
    const mine = new Set(visibleProfiles(data, ctx).map((p) => p.id));
    unread = data.notifications.filter((n) => !n.read && mine.has(n.profileId)).length;
  }
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/cookie-banner.css" />
      </head>
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
                <Link href="/connections" className="text-sm text-muted hover:text-foreground">
                  Connections
                </Link>
                <Link href="/notifications" className="text-sm text-muted hover:text-foreground">
                  Notifications
                  {unread > 0 && (
                    <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-ink" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </Link>
                <span className="ml-auto flex items-center gap-4">
                  <Link href="/account" className="text-sm text-muted hover:text-foreground">
                    {ctx?.user.name || ctx?.user.email}
                  </Link>
                  <form method="post" action="/api/logout">
                    <button className="text-sm text-muted hover:text-foreground" type="submit">
                      Sign out
                    </button>
                  </form>
                </span>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/cookies" className="hover:text-foreground">
            Cookies
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <button type="button" data-cookie-settings className="hover:text-foreground">
            Cookie settings
          </button>
        </footer>
        <Script src="/cookie-banner.js" strategy="afterInteractive" data-cookie-banner data-mode="notice" data-policy-url="/cookies" />
      </body>
    </html>
  );
}
