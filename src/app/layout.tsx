import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earshot — social listening",
  description: "Social listening you set up in five minutes and tune like a playlist.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Earshot
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-foreground">
              Profiles
            </Link>
            <Link href="/profiles/new" className="text-sm text-muted hover:text-foreground">
              New profile
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
