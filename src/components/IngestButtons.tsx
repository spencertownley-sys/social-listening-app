"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IngestRun } from "@/lib/store";

export function IngestButtons({ hasProfiles, hasDemo, isOwner }: { hasProfiles: boolean; hasDemo: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"live" | "demo" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(demo: boolean) {
    setBusy(demo ? "demo" : "live");
    setMessage(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo }),
      });
      const body = (await res.json()) as { run?: IngestRun; error?: string };
      if (!res.ok || !body.run) throw new Error(body.error ?? "Ingest failed");
      const r = body.run;
      const errors = r.connectors.filter((c) => c.error).map((c) => `${c.name}: ${c.error}`);
      setMessage(
        `Fetched ${r.fetched} posts, ${r.newPosts} new, ${r.passedPreFilter} passed the pre-filter, ${r.matches} new matches.` +
          (errors.length ? ` Skipped — ${errors.join("; ")}` : ""),
      );
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clearDemo() {
    if (!confirm("Remove the demo posts and their matches? Real posts are kept.")) return;
    setBusy("clear");
    const res = await fetch("/api/demo", { method: "DELETE" });
    const body = (await res.json()) as { removed?: number };
    setMessage(`Removed ${body.removed ?? 0} demo posts.`);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {!isOwner ? null : hasDemo ? (
          <button className="btn" onClick={clearDemo} disabled={!!busy}>
            {busy === "clear" ? "Removing…" : "Remove demo posts"}
          </button>
        ) : (
          <button className="btn" onClick={() => run(true)} disabled={!!busy}>
            {busy === "demo" ? "Loading…" : "Load demo posts"}
          </button>
        )}
        <button
          className="btn-primary"
          onClick={() => run(false)}
          disabled={!!busy || !hasProfiles}
          title={hasProfiles ? "Search every connected network for your profiles' terms" : "Create a profile first"}
        >
          {busy === "live" ? "Listening…" : "Listen now"}
        </button>
      </div>
      {message ? (
        <p className="max-w-md text-right text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
