import Link from "next/link";
import { dashboardFor, feedFor } from "@/lib/analytics";
import { claudeEnabled } from "@/lib/enrich/claude";
import { activeSources, LIVE_NETWORKS } from "@/lib/profile";
import { read } from "@/lib/store";
import { NETWORK_LABELS } from "@/lib/types";
import { IngestButtons } from "@/components/IngestButtons";
import { NetScore, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await read();
  const lastRun = data.runs.at(-1);
  const postCount = Object.keys(data.posts).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your listening profiles</h1>
          <p className="mt-1 text-sm text-muted">
            {postCount} posts stored · labels by {claudeEnabled() ? "Claude" : "the offline classifier (set ANTHROPIC_API_KEY for Claude)"}
            {lastRun ? ` · last run ${timeAgo(lastRun.finishedAt)}` : ""}
          </p>
        </div>
        <IngestButtons hasProfiles={data.profiles.length > 0} />
      </div>

      {data.profiles.length === 0 ? (
        <div className="card space-y-3 text-center">
          <h2 className="text-lg font-semibold">Set up your first profile</h2>
          <p className="text-sm text-muted">
            Tell Earshot what to listen for in plain English, pick networks and tone, and preview matches before you save.
            No keyword syntax needed. Load the demo posts first to see it work without any API keys.
          </p>
          <div>
            <Link href="/profiles/new" className="btn-primary">
              Create a profile
            </Link>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.profiles.map((p) => {
            const items = feedFor(data, p.id);
            const d = dashboardFor(items);
            const sources = activeSources(p.config);
            return (
              <li key={p.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/profiles/${p.id}`} className="font-semibold hover:underline">
                    {p.config.name}
                  </Link>
                  <span className="chip text-muted">
                    v{p.version} · {p.status}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {[...p.config.match.any, ...p.config.match.all].slice(0, 5).join(", ") || p.config.match.semantic || p.config.match.query}
                </p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Matches</dt>
                    <dd className="font-semibold">{d.total}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Net sentiment</dt>
                    <dd>
                      <NetScore value={d.netSentiment} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Delivery</dt>
                    <dd>
                      {p.config.delivery.mode === "digest" ? `${p.config.delivery.cadence} digest` : p.config.delivery.mode}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted">
                  {sources.map((s) => NETWORK_LABELS[s] + (LIVE_NETWORKS.includes(s) ? "" : " (coming soon)")).join(" · ")}
                </p>
                <div className="mt-auto flex gap-2">
                  <Link href={`/profiles/${p.id}`} className="btn">
                    Feed
                  </Link>
                  <Link href={`/profiles/${p.id}/dashboard`} className="btn">
                    Dashboard
                  </Link>
                  <Link href={`/profiles/${p.id}/digest`} className="btn">
                    Digest
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lastRun ? (
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Last ingest run</h2>
          <p className="text-muted">
            {lastRun.fetched} fetched → {lastRun.newPosts} new → {lastRun.passedPreFilter} passed the pre-filter →{" "}
            {lastRun.enriched} labelled ({lastRun.enrichModel}) → {lastRun.matches} matches
          </p>
          <ul className="mt-2 space-y-1">
            {lastRun.connectors.map((c) => (
              <li key={c.name}>
                <span className="font-medium">{c.name}</span>:{" "}
                {c.error ? <span className="text-danger">skipped — {c.error}</span> : `${c.fetched} posts`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
