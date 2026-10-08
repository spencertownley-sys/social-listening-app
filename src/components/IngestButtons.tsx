"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IngestRun } from "@/lib/store";

export function IngestButtons({ hasProfiles }: { hasProfiles: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"live" | "demo" | null>(null);
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

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button className="btn" onClick={() => run(true)} disabled={!!busy}>
          {busy === "demo" ? "Loading…" : "Load demo posts"}
        </button>
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
