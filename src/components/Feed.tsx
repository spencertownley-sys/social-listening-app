"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FeedItem } from "@/lib/analytics";
import { NETWORK_LABELS, SENTIMENTS, type FeedbackAction, type Network, type Sentiment } from "@/lib/types";
import { IntentChips, NetworkBadge, SentimentChip, timeAgo } from "./ui";

type Sort = "relevance" | "newest" | "reach";

/** `now` comes from the server render so the date filter is stable across re-renders. */
export function Feed({ profileId, items, now }: { profileId: string; items: FeedItem[]; now: number }) {
  const router = useRouter();
  const [network, setNetwork] = useState<Network | "all">("all");
  const [sentiment, setSentiment] = useState<Sentiment | "all">("all");
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<Sort>("relevance");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);

  const networks = useMemo(() => [...new Set(items.map((i) => i.post.network))], [items]);
  const shown = useMemo(() => {
    const since = now - days * 86_400_000;
    const reach = (i: FeedItem) => i.post.author.followerCount ?? i.post.engagement.views ?? 0;
    return items
      .filter((i) => (network === "all" || i.post.network === network) && (sentiment === "all" || i.sentiment === sentiment))
      .filter((i) => Date.parse(i.post.postedAt) >= since)
      .sort((a, b) =>
        sort === "newest"
          ? Date.parse(b.post.postedAt) - Date.parse(a.post.postedAt)
          : sort === "reach"
            ? reach(b) - reach(a)
            : b.match.relevance - a.match.relevance,
      );
  }, [items, network, sentiment, days, sort, now]);

  async function feedback(postId: string, action: FeedbackAction, correctedSentiment?: Sentiment) {
    setBusy(postId + action);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, postId, action, correctedSentiment }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
      setToast(
        {
          relevant: "Thanks — more posts like this will rank higher.",
          more_like_this: "Got it — boosting posts like this.",
          not_relevant: "Got it — posts like this will rank lower or disappear.",
          mute_author: "Author muted for this profile.",
          wrong_sentiment: "Label corrected.",
        }[action],
      );
      setFixing(null);
      router.refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Network</span>
          <select className="input w-auto" value={network} onChange={(e) => setNetwork(e.target.value as Network | "all")}>
            <option value="all">All</option>
            {networks.map((n) => (
              <option key={n} value={n}>
                {NETWORK_LABELS[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Sentiment</span>
          <select className="input w-auto" value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment | "all")}>
            <option value="all">All</option>
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Date</span>
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Sort</span>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest</option>
            <option value="reach">Biggest reach</option>
          </select>
        </label>
        <span className="ml-auto text-muted">{shown.length} posts</span>
      </div>

      {toast && (
        <p className="text-sm text-muted" role="status">
          {toast}
        </p>
      )}

      {shown.length === 0 && <p className="card text-sm text-muted">Nothing here yet. Run &quot;Listen now&quot; or loosen the filters.</p>}

      <ul className="space-y-3">
        {shown.map((it) => {
          const { post, match, enrichment } = it;
          return (
            <li key={match.id} className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <NetworkBadge network={post.network} />
                <span className="font-medium text-foreground">{post.author.displayName ?? post.author.handle}</span>
                <span>{post.author.handle}</span>
                {post.author.followerCount ? <span>{post.author.followerCount.toLocaleString()} followers</span> : null}
                <span>{timeAgo(post.postedAt)}</span>
                <span className="ml-auto">relevance {match.relevance}</span>
              </div>
              <div className="flex gap-3">
                {post.media[0]?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.media[0].thumbnailUrl} alt="" className="h-16 w-24 rounded object-cover" />
                ) : null}
                <p className="text-sm whitespace-pre-line">
                  {post.title ? <strong>{post.title}. </strong> : null}
                  {post.text}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SentimentChip sentiment={it.sentiment} confidence={enrichment.sentimentConfidence} corrected={it.corrected} />
                <IntentChips intents={enrichment.intents} />
                {enrichment.emotions.map((e) => (
                  <span key={e} className="chip text-muted">
                    {e}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted">
                <span className="font-medium">Why this matched:</span> {match.reasons.map((r) => r.detail).join(" · ")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={!!busy} onClick={() => feedback(post.id, "relevant")}>
                  👍 Relevant
                </button>
                <button className="btn" disabled={!!busy} onClick={() => feedback(post.id, "not_relevant")}>
                  👎 Not relevant
                </button>
                <button className="btn" disabled={!!busy} onClick={() => feedback(post.id, "more_like_this")}>
                  More like this
                </button>
                <button className="btn" disabled={!!busy} onClick={() => setFixing(fixing === post.id ? null : post.id)} aria-expanded={fixing === post.id}>
                  Wrong sentiment
                </button>
                <button className="btn" disabled={!!busy} onClick={() => feedback(post.id, "mute_author")}>
                  Mute author
                </button>
                <a className="btn" href={post.url} target="_blank" rel="noreferrer">
                  Open original
                </a>
              </div>
              {fixing === post.id && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  This post is actually:
                  {SENTIMENTS.filter((s) => s !== it.sentiment).map((s) => (
                    <button key={s} className="btn" onClick={() => feedback(post.id, "wrong_sentiment", s)}>
                      <SentimentChip sentiment={s} />
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
