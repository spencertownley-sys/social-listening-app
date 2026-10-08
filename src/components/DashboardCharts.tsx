"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@/lib/analytics";
import { INTENT_LABELS, type Intent, type Sentiment } from "@/lib/types";
import { NetScore, SENTIMENT_STYLE } from "./ui";

// Stack order runs from one pole to the other with the gray midpoint and "mixed" between.
const ORDER: Sentiment[] = ["positive", "neutral", "mixed", "negative"];
const FILL: Record<Sentiment, string> = {
  positive: "var(--pos)",
  neutral: "var(--neu)",
  mixed: "var(--mix)",
  negative: "var(--neg)",
};
const AXIS = { stroke: "var(--muted)", fontSize: 12 };
const TOOLTIP = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--foreground)", fontSize: 12 },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "var(--line)", opacity: 0.4 },
};

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl">{children}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function DashboardCharts({ d }: { d: Dashboard }) {
  const volume = d.volume.map((v) => ({ ...v, label: v.day.slice(5) }));
  const split = ORDER.map((s) => ({ sentiment: s, count: d.sentimentSplit.find((x) => x.sentiment === s)?.count ?? 0 }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Mentions (last 90 days)">{d.total}</Tile>
        <Tile label="Net sentiment" hint="(positive − negative) ÷ all, −100 to +100">
          <NetScore value={d.netSentiment} />
        </Tile>
        <Tile label="Top network">{d.networks[0]?.network ?? "—"}</Tile>
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Mention volume, last 14 days, by sentiment</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volume} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP} />
              <Legend
                itemSorter={(item) => ORDER.indexOf(item.value as Sentiment)}
                formatter={(value: string) => (
                  <span style={{ color: "var(--foreground)", fontSize: 12 }}>
                    {SENTIMENT_STYLE[value as Sentiment].symbol} {SENTIMENT_STYLE[value as Sentiment].label}
                  </span>
                )}
              />
              {ORDER.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="v"
                  fill={FILL[s]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  maxBarSize={28}
                  radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0}
                  name={s}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show as a table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1">Day</th>
                {ORDER.map((s) => (
                  <th key={s}>{SENTIMENT_STYLE[s].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.volume.map((v) => (
                <tr key={v.day} className="border-t border-line">
                  <td className="py-1">{v.day}</td>
                  {ORDER.map((s) => (
                    <td key={s}>{v[s]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Sentiment split</h2>
          <ul className="space-y-2 text-sm">
            {split.map(({ sentiment, count }) => {
              const pct = d.total ? Math.round((count / d.total) * 100) : 0;
              const st = SENTIMENT_STYLE[sentiment];
              return (
                <li key={sentiment}>
                  <div className="flex justify-between">
                    <span>
                      {st.symbol} {st.label}
                    </span>
                    <span className="text-muted">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-background" aria-hidden>
                    <div className={`h-2 rounded-full ${st.swatch}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Mentions by network</h2>
          <div style={{ height: Math.max(120, d.networks.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.networks} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 8 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="network" tick={AXIS} tickLine={false} axisLine={false} width={120} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="count" name="Mentions" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="count" position="right" style={{ fill: "var(--foreground)", fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Top authors by reach</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1">Author</th>
                <th>Network</th>
                <th className="text-right">Reach</th>
                <th className="text-right">Posts</th>
              </tr>
            </thead>
            <tbody>
              {d.topAuthors.map((a) => (
                <tr key={a.network + a.handle} className="border-t border-line">
                  <td className="py-1.5">{a.handle}</td>
                  <td className="text-muted">{a.network}</td>
                  <td className="text-right">{a.reach ? a.reach.toLocaleString() : "—"}</td>
                  <td className="text-right">{a.posts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">What people are doing</h2>
          {d.intents.length === 0 ? (
            <p className="text-sm text-muted">No intents detected yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.intents.map((i) => (
                <li key={i.intent} className="flex justify-between border-t border-line py-1.5">
                  <span>{INTENT_LABELS[i.intent as Intent]}</span>
                  <span className="text-muted">{i.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
