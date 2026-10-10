import { CONNECTION_INFO, missingEnv, UNAVAILABLE } from "@/lib/connections";
import { claudeEnabled } from "@/lib/enrich/claude";
import { jetstreamStatus } from "@/lib/jetstream";
import { read } from "@/lib/store";
import { timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const data = await read();
  const lastRun = [...data.runs].reverse().find((r) => r.connectors.some((c) => c.network !== "demo"));
  const result = new Map(lastRun?.connectors.map((c) => [c.network, c]) ?? []);
  const stream = jetstreamStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-muted">
          Each network needs its own key, created in your account on that network. Add keys in Railway → earshot → earshot-web → Variables; the
          service restarts and picks them up. Step-by-step instructions are in <code>docs/API_ACCESS.md</code> in the repo.
          {lastRun ? ` Last listening run ${timeAgo(lastRun.finishedAt)}.` : ""}
        </p>
      </div>

      <section className="card text-sm">
        <h2 className="font-semibold">AI labelling</h2>
        <p className="mt-1">
          {claudeEnabled() ? (
            <span>✓ Claude is labelling sentiment, emotion and intent.</span>
          ) : (
            <span>
              ✗ Using the offline classifier. Set <code>ANTHROPIC_API_KEY</code> for much better labels; stored posts are re-labelled on the next run.
            </span>
          )}
        </p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2">
        {CONNECTION_INFO.map((info) => {
          const missing = missingEnv(info);
          const ready = missing.length === 0;
          const r = result.get(info.network);
          return (
            <li key={info.network} className="card space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{info.name}</h2>
                <span className={`chip ${ready ? "border-accent text-accent" : "text-muted"}`}>
                  {ready ? "✓ Connected" : info.optional ? "Works without keys" : "✗ Needs a key"}
                </span>
              </div>
              {!ready && missing.length > 0 && (
                <p>
                  Set: {missing.map((m) => <code key={m} className="mr-1">{m}</code>)}
                </p>
              )}
              <p className="text-muted">
                Cost: {info.cost} · Approval: {info.approval}
              </p>
              {info.note && <p className="text-muted">{info.note}</p>}
              {info.network === "bluesky" && (
                <p className={stream.connected ? "text-muted" : "text-danger"}>
                  Real-time stream:{" "}
                  {!stream.enabled
                    ? "off (runs on the hosted server)"
                    : stream.connected
                      ? `connected · ${stream.received.toLocaleString()} posts seen, ${stream.kept.toLocaleString()} kept, ${stream.matches.toLocaleString()} matches${stream.lastFlushAt ? `, last saved ${timeAgo(stream.lastFlushAt)}` : ""}`
                      : `reconnecting${stream.lastError ? ` (${stream.lastError})` : ""}`}
                </p>
              )}
              {r && (
                <p className={r.error ? "text-danger" : "text-muted"}>
                  Last run: {r.error ? `skipped — ${r.error}` : `${r.fetched} posts`}
                </p>
              )}
              {info.portal && (
                <a href={info.portal} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Open the developer portal ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <section className="card text-sm">
        <h2 className="mb-2 font-semibold">Not available</h2>
        <ul className="space-y-1 text-muted">
          {UNAVAILABLE.map((u) => (
            <li key={u.name}>
              <span className="font-medium text-foreground">{u.name}:</span> {u.why}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-muted">Earshot doesn&apos;t scrape: every source uses an official API or public feed.</p>
      </section>
    </div>
  );
}
