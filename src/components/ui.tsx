import { INTENT_LABELS, NETWORK_LABELS, type Intent, type Network, type Sentiment } from "@/lib/types";

/** Sentiment is always shown as a symbol + word, never by colour alone (WCAG / PRD). */
export const SENTIMENT_STYLE: Record<Sentiment, { symbol: string; label: string; swatch: string }> = {
  positive: { symbol: "+", label: "Positive", swatch: "bg-pos" },
  neutral: { symbol: "○", label: "Neutral", swatch: "bg-neu" },
  mixed: { symbol: "±", label: "Mixed", swatch: "bg-mix" },
  negative: { symbol: "−", label: "Negative", swatch: "bg-neg" },
};

export function SentimentChip({ sentiment, confidence, corrected }: { sentiment: Sentiment; confidence?: number; corrected?: boolean }) {
  const s = SENTIMENT_STYLE[sentiment];
  return (
    <span className="chip font-medium">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${s.swatch}`} />
      <span aria-hidden>{s.symbol}</span>
      {s.label}
      {corrected ? <span className="font-normal text-muted">(your label)</span> : null}
      {!corrected && confidence !== undefined ? <span className="font-normal text-muted">{Math.round(confidence * 100)}%</span> : null}
    </span>
  );
}

export function NetworkBadge({ network }: { network: Network }) {
  return <span className="chip bg-background font-medium">{NETWORK_LABELS[network]}</span>;
}

export function IntentChips({ intents }: { intents: Intent[] }) {
  return (
    <>
      {intents.map((i) => (
        <span key={i} className="chip text-muted">
          {INTENT_LABELS[i]}
        </span>
      ))}
    </>
  );
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function NetScore({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span className="font-semibold" title="Net sentiment: (positive − negative) ÷ all posts, from −100 to +100">
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
