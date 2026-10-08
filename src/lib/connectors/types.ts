import type { Network, Post } from "../types";

export interface FetchRequest {
  /** Plain search strings derived from the union of active profiles (words, "phrases", #tags). */
  terms: string[];
  since: Date;
  /** Soft cap per term. */
  limit: number;
}

/**
 * A connector turns one network's API into normalized Posts. Each network is a plug-in so that
 * coverage can change per plan and per vendor without touching the matcher (PRD: connector layer).
 */
export interface Connector {
  network: Network;
  name: string;
  /** Why it is off, or null when it can run (missing key, etc.). */
  unavailableReason(): string | null;
  fetch(req: FetchRequest): Promise<Post[]>;
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": "Earshot/0.1 (social listening; public data only)", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}
