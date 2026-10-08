"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ProfileDraft } from "@/lib/assist";
import { LIVE_NETWORKS, TEMPLATES, type ProfileConfig, type ProfileConfigInput } from "@/lib/profile";
import { validateQuery } from "@/lib/query";
import {
  EMOTIONS,
  INTENT_LABELS,
  INTENTS,
  NETWORK_LABELS,
  NETWORKS,
  SENTIMENTS,
  type Emotion,
  type Intent,
  type Match,
  type Network,
  type Post,
  type Sentiment,
} from "@/lib/types";
import { IntentChips, NetworkBadge, SentimentChip, timeAgo } from "./ui";

type Channel = ProfileConfig["delivery"]["channels"][number];
const CHANNELS: { id: Channel; label: string; live: boolean }[] = [
  { id: "in_app", label: "In-app", live: true },
  { id: "email", label: "Email", live: true },
  { id: "push", label: "Push", live: false },
  { id: "sms", label: "SMS", live: false },
  { id: "slack", label: "Slack", live: false },
  { id: "discord", label: "Discord", live: false },
  { id: "webhook", label: "Webhook", live: false },
];

interface FormState {
  name: string;
  description: string;
  any: string;
  all: string;
  exclude: string;
  query: string;
  semantic: string;
  excludePresets: ("jobs" | "giveaways" | "bots")[];
  sources: Partial<Record<Network, number>>;
  sentiment: Sentiment[];
  minConfidence: number;
  intents: Intent[];
  emotions: Emotion[];
  minFollowers: string;
  excludeBots: boolean;
  ownAccounts: string;
  includeReposts: boolean;
  language: string;
  mode: ProfileConfig["delivery"]["mode"];
  cadence: ProfileConfig["delivery"]["cadence"];
  channels: Channel[];
  quietStart: string;
  quietEnd: string;
}

const lines = (s: string) =>
  s
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

function fromConfig(c?: ProfileConfig | ProfileConfigInput): FormState {
  return {
    name: c?.name ?? "",
    description: c?.description ?? "",
    any: (c?.match.any ?? []).join("\n"),
    all: (c?.match.all ?? []).join("\n"),
    exclude: (c?.match.exclude ?? []).join("\n"),
    query: c?.match.query ?? "",
    semantic: c?.match.semantic ?? "",
    excludePresets: c?.match.exclude_presets ?? ["giveaways", "jobs"],
    sources: c?.sources ?? Object.fromEntries(LIVE_NETWORKS.map((n) => [n, 100])),
    sentiment: c?.sentiment?.keep ?? [...SENTIMENTS],
    minConfidence: c?.sentiment?.min_confidence ?? 0,
    intents: c?.intents ?? [],
    emotions: c?.emotions ?? [],
    minFollowers: c?.author?.min_followers !== undefined ? String(c.author.min_followers) : "",
    excludeBots: c?.author?.exclude_bots ?? true,
    ownAccounts: (c?.author?.own_accounts ?? []).join("\n"),
    includeReposts: c?.content?.kinds?.includes("repost") ?? false,
    language: (c?.language ?? []).join(", "),
    mode: c?.delivery?.mode ?? "digest",
    cadence: c?.delivery?.cadence ?? "daily",
    channels: c?.delivery?.channels ?? ["in_app", "email"],
    quietStart: c?.quiet_hours?.start ?? "",
    quietEnd: c?.quiet_hours?.end ?? "",
  };
}

function toConfig(f: FormState, base?: ProfileConfig): ProfileConfigInput {
  return {
    name: f.name.trim() || "Untitled profile",
    description: f.description.trim() || undefined,
    sources: f.sources,
    match: {
      any: lines(f.any),
      all: lines(f.all),
      query: f.query.trim() || undefined,
      semantic: f.semantic.trim() || undefined,
      exclude: lines(f.exclude),
      exclude_presets: f.excludePresets,
    },
    sentiment: { keep: f.sentiment, min_confidence: f.minConfidence },
    intents: f.intents,
    emotions: f.emotions,
    author: {
      ...(base?.author ?? {}),
      min_followers: f.minFollowers ? Number(f.minFollowers) : undefined,
      exclude_bots: f.excludeBots,
      verified_only: base?.author.verified_only ?? false,
      own_accounts: lines(f.ownAccounts),
      muted: base?.author.muted ?? [],
    },
    content: {
      ...(base?.content ?? {}),
      kinds: f.includeReposts ? ["original", "reply", "repost"] : ["original", "reply"],
      min_engagement: base?.content.min_engagement ?? 0,
      video_only: base?.content.video_only ?? false,
    },
    language: lines(f.language.toLowerCase()),
    countries: base?.countries ?? [],
    delivery: {
      mode: f.mode,
      cadence: f.cadence,
      channels: f.channels,
      spike_multiplier: base?.delivery.spike_multiplier ?? 3,
    },
    quiet_hours:
      f.quietStart && f.quietEnd
        ? { start: f.quietStart, end: f.quietEnd, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : undefined,
    caps: base?.caps,
  };
}

type PreviewRow = { post: Post; match: Match; sentiment: Sentiment; intents: Intent[] };

const STEPS = ["What to hear", "Networks", "Tone & intent", "Preview", "Delivery"] as const;

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function Builder({ profileId, initial }: { profileId?: string; initial?: ProfileConfig }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<FormState>(() => fromConfig(initial));
  const [subject, setSubject] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const queryCheck = useMemo(() => (f.query.trim() ? validateQuery(f.query) : null), [f.query]);
  const hasWhat = lines(f.any).length + lines(f.all).length > 0 || !!f.semantic.trim() || !!f.query.trim();

  async function draft() {
    if (!subject.trim()) return;
    setDrafting(true);
    setDraftNote(null);
    setError(null);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: subject }),
      });
      const body = (await res.json()) as { draft?: ProfileDraft; source?: string; error?: string };
      if (!res.ok || !body.draft) throw new Error(body.error ?? "Couldn't draft a profile");
      const d = body.draft;
      setF((s) => ({
        ...s,
        name: s.name || d.name,
        description: subject,
        any: d.any.join("\n"),
        exclude: d.exclude.join("\n"),
        semantic: d.semantic,
        sentiment: d.sentiment_keep.length ? d.sentiment_keep : s.sentiment,
        intents: d.intents,
      }));
      if (d.competitors.length) setCompetitors(d.competitors.join(", "));
      setDraftNote(
        body.source === "claude"
          ? "Drafted by Claude. Edit anything below."
          : "Drafted offline from your words (set ANTHROPIC_API_KEY for a smarter draft). Edit anything below.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const terms = lines(f.any).length ? lines(f.any) : lines(subject);
    const built = t.build(terms, lines(competitors));
    setF((s) => ({ ...fromConfig(built), description: s.description, exclude: s.exclude, semantic: s.semantic, any: built.match.any?.join("\n") ?? s.any }));
  }

  async function runPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: toConfig(f, initial) }),
      });
      const body = (await res.json()) as { results?: PreviewRow[]; error?: string };
      if (!res.ok || !body.results) throw new Error(body.error ?? "Preview failed");
      setPreview(body.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(profileId ? `/api/profiles/${profileId}` : "/api/profiles", {
        method: profileId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: toConfig(f, initial) }),
      });
      const body = (await res.json()) as { profile?: { id: string }; error?: string };
      if (!res.ok || !body.profile) throw new Error(body.error ?? "Couldn't save");
      // Ratings given during preview become real feedback on the new profile.
      await Promise.all(
        Object.entries(ratings).map(([postId, r]) =>
          fetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ profileId: body.profile!.id, postId, action: r === "up" ? "relevant" : "not_relevant" }),
          }),
        ),
      );
      router.push(`/profiles/${body.profile.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  function next() {
    const n = Math.min(STEPS.length - 1, step + 1);
    setStep(n);
    if (STEPS[n] === "Preview") void runPreview();
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              className={`chip ${i === step ? "border-accent font-semibold text-accent" : "text-muted"}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => {
                setStep(i);
                if (s === "Preview") void runPreview();
              }}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-5">
          {!profileId && (
            <div className="card space-y-3">
              <label className="block font-semibold" htmlFor="subject">
                What do you want to listen for?
              </label>
              <textarea
                id="subject"
                className="input min-h-20"
                placeholder={'e.g. "Tell me when people complain about Bean There Coffee in Portland, or ask for coffee shop recommendations"'}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" onClick={draft} disabled={drafting || !subject.trim()}>
                  {drafting ? "Drafting…" : "Draft my profile"}
                </button>
                {draftNote && <span className="text-xs text-muted">{draftNote}</span>}
              </div>
              <div>
                <p className="mb-2 text-sm text-muted">Or start from a template:</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button key={t.id} className="btn" title={t.blurb} onClick={() => applyTemplate(t.id)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Profile name</span>
              <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Listen for any of (one per line)</span>
              <textarea className="input min-h-32 font-mono" value={f.any} onChange={(e) => set("any", e.target.value)} />
              <span className="text-xs text-muted">Names, &quot;exact phrases&quot;, #hashtags, @handles, domain:site.com</span>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Never show posts with (one per line)</span>
              <textarea className="input min-h-32 font-mono" value={f.exclude} onChange={(e) => set("exclude", e.target.value)} />
              <span className="flex flex-wrap gap-3 text-xs">
                {(["giveaways", "jobs", "bots"] as const).map((p) => (
                  <label key={p} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={f.excludePresets.includes(p)} onChange={() => set("excludePresets", toggle(f.excludePresets, p))} />
                    {p === "jobs" ? "job posts" : p}
                  </label>
                ))}
              </span>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Topic in a sentence (matched by meaning)</span>
              <input className="input" placeholder="people frustrated with cruise ship Wi-Fi" value={f.semantic} onChange={(e) => set("semantic", e.target.value)} />
            </label>
            <details className="sm:col-span-2">
              <summary className="cursor-pointer text-sm font-medium">Advanced: must-include terms and boolean query</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm">Must also include all of (one per line)</span>
                  <textarea className="input min-h-20 font-mono" value={f.all} onChange={(e) => set("all", e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Boolean query</span>
                  <textarea
                    className="input min-h-20 font-mono"
                    placeholder='("royal caribbean" OR carnival) AND wifi NEAR/5 slow NOT starlink'
                    value={f.query}
                    onChange={(e) => set("query", e.target.value)}
                    aria-invalid={queryCheck?.ok === false}
                  />
                  {queryCheck && !queryCheck.ok ? (
                    <span className="text-xs text-danger" role="alert">
                      {queryCheck.error} (character {queryCheck.position + 1})
                    </span>
                  ) : (
                    <span className="text-xs text-muted">AND, OR, NOT, -word, &quot;phrase&quot;, NEAR/n, ( ), word*</span>
                  )}
                </label>
              </div>
            </details>
            {!profileId && (
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm font-medium">Competitors (optional, used by the Competitor Watch template)</span>
                <input className="input" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Stumptown, Coava" />
              </label>
            )}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {NETWORKS.map((n) => {
            const w = f.sources[n] ?? 0;
            const live = LIVE_NETWORKS.includes(n);
            return (
              <div key={n} className="card space-y-2">
                <label className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {NETWORK_LABELS[n]} {!live && <span className="text-xs font-normal text-muted">(coming soon)</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={w > 0}
                    onChange={(e) => set("sources", { ...f.sources, [n]: e.target.checked ? 100 : 0 })}
                  />
                </label>
                <label className="flex items-center gap-3 text-xs text-muted">
                  Weight
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={w}
                    onChange={(e) => set("sources", { ...f.sources, [n]: Number(e.target.value) })}
                    className="flex-1"
                    aria-label={`${NETWORK_LABELS[n]} weight`}
                  />
                  <span className="w-8 text-right">{w}</span>
                </label>
              </div>
            );
          })}
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-5">
          <fieldset>
            <legend className="mb-2 font-medium">Keep these tones</legend>
            <div className="flex flex-wrap gap-3">
              {SENTIMENTS.map((s) => (
                <label key={s} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={f.sentiment.includes(s)} onChange={() => set("sentiment", toggle(f.sentiment, s))} />
                  <SentimentChip sentiment={s} />
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm">
              Only when at least
              <input type="range" min={0} max={0.95} step={0.05} value={f.minConfidence} onChange={(e) => set("minConfidence", Number(e.target.value))} />
              {Math.round(f.minConfidence * 100)}% confident
            </label>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-medium">Only these kinds of posts (leave empty for all)</legend>
            <div className="flex flex-wrap gap-2">
              {INTENTS.map((i) => (
                <button key={i} className={`chip ${f.intents.includes(i) ? "border-accent text-accent" : ""}`} aria-pressed={f.intents.includes(i)} onClick={() => set("intents", toggle(f.intents, i))}>
                  {INTENT_LABELS[i]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-medium">Emotions (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map((e) => (
                <button key={e} className={`chip ${f.emotions.includes(e) ? "border-accent text-accent" : ""}`} aria-pressed={f.emotions.includes(e)} onClick={() => set("emotions", toggle(f.emotions, e))}>
                  {e}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 font-medium">Who is speaking</legend>
            <label className="space-y-1 text-sm">
              Min followers
              <input className="input" inputMode="numeric" value={f.minFollowers} onChange={(e) => set("minFollowers", e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="space-y-1 text-sm">
              Your own accounts (excluded)
              <input className="input" value={f.ownAccounts} onChange={(e) => set("ownAccounts", e.target.value)} placeholder="@mybrand" />
            </label>
            <label className="space-y-1 text-sm">
              Languages (blank = any)
              <input className="input" value={f.language} onChange={(e) => set("language", e.target.value)} placeholder="en, es" />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.excludeBots} onChange={(e) => set("excludeBots", e.target.checked)} /> Hide likely bots
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.includeReposts} onChange={(e) => set("includeReposts", e.target.checked)} /> Include reposts
            </label>
          </fieldset>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">Up to 20 matches from the last 7 days of stored posts. Rate a few; ratings train the profile when you save.</p>
            <button className="btn" onClick={runPreview} disabled={previewing}>
              {previewing ? "Matching…" : "Refresh"}
            </button>
          </div>
          {preview && preview.length === 0 && (
            <p className="card text-sm">
              No matches yet. Try broader terms, more tones, or more networks. If nothing is stored yet, use &quot;Load demo posts&quot; or &quot;Listen now&quot; on the
              Profiles page after saving.
            </p>
          )}
          <ul className="space-y-3">
            {preview?.map(({ post, match, sentiment, intents }) => (
              <li key={post.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <NetworkBadge network={post.network} />
                  <span>{post.author.handle}</span>
                  <span>{timeAgo(post.postedAt)}</span>
                  <SentimentChip sentiment={sentiment} />
                  <IntentChips intents={intents} />
                </div>
                <p className="text-sm">{post.title ? <strong>{post.title}. </strong> : null}{post.text}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">Why: {match.reasons.map((r) => r.detail).join(" · ")}</p>
                  <div className="flex gap-1">
                    {(["up", "down"] as const).map((r) => (
                      <button
                        key={r}
                        className={`btn ${ratings[post.id] === r ? "border-accent text-accent" : ""}`}
                        aria-pressed={ratings[post.id] === r}
                        onClick={() => setRatings((x) => ({ ...x, [post.id]: r }))}
                      >
                        {r === "up" ? "👍 Relevant" : "👎 Not relevant"}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 4 && (
        <section className="card space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">How should you hear about it?</legend>
            {(
              [
                ["digest", "Digest on a schedule"],
                ["realtime", "As it happens"],
                ["spike", "Only when volume spikes"],
              ] as const
            ).map(([m, label]) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={f.mode === m} onChange={() => set("mode", m)} /> {label}
              </label>
            ))}
            {f.mode === "digest" && (
              <select className="input w-auto" value={f.cadence} onChange={(e) => set("cadence", e.target.value as FormState["cadence"])} aria-label="Digest cadence">
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-medium">Where</legend>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((c) => (
                <label key={c.id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.channels.includes(c.id)} onChange={() => set("channels", toggle(f.channels, c.id))} />
                  {c.label}
                  {!c.live && <span className="text-xs text-muted">(soon)</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-3 text-sm">
            <legend className="mb-2 font-medium">Quiet hours (optional)</legend>
            <input type="time" className="input w-auto" value={f.quietStart} onChange={(e) => set("quietStart", e.target.value)} aria-label="Quiet hours start" />
            to
            <input type="time" className="input w-auto" value={f.quietEnd} onChange={(e) => set("quietEnd", e.target.value)} aria-label="Quiet hours end" />
          </fieldset>
        </section>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Back
        </button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 && (
            <button className="btn" onClick={next} disabled={!hasWhat}>
              Next: {STEPS[step + 1]}
            </button>
          )}
          <button className="btn-primary" onClick={save} disabled={saving || !hasWhat || f.sentiment.length === 0 || queryCheck?.ok === false}>
            {saving ? "Saving…" : profileId ? "Save new version" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
