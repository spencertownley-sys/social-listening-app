import { runAlerts } from "./alerts";
import { blueskyConnector } from "./connectors/bluesky";
import { demoPosts } from "./connectors/demo";
import { mastodonConnector } from "./connectors/mastodon";
import { rssConnector } from "./connectors/rss";
import type { Connector } from "./connectors/types";
import { youtubeConnector } from "./connectors/youtube";
import { claudeEnabled, ENRICH_MODEL, enrichPosts, needsEnrichment } from "./enrich/claude";
import { HEURISTIC_MODEL } from "./enrich/heuristic";
import { buildPreFilter, compileProfile, matchPost } from "./matcher";
import { activeSources, type ListeningProfile } from "./profile";
import { atomToSearchString, fold, makeDoc } from "./query";
import { getLearning, mutate, newId, read, type IngestRun, type StoreData } from "./store";
import type { Match, Post } from "./types";

export const CONNECTORS: Connector[] = [blueskyConnector, youtubeConnector, rssConnector, mastodonConnector];

const PREVIEW_DAYS = 7;

/** Collapse exact repeats (same network id) and near-duplicates (same normalized text, e.g. cross-posts). */
export function dedupe(posts: Post[], existing: Record<string, Post> = {}): Post[] {
  const seenIds = new Set(Object.keys(existing));
  const textKey = (p: Post) => `${fold(p.author.handle)}|${fold([p.title, p.text].join(" ")).replace(/\W+/g, " ").trim().slice(0, 280)}`;
  const seenText = new Set(Object.values(existing).map(textKey));
  const out: Post[] = [];
  for (const p of posts) {
    if (seenIds.has(p.id)) continue;
    const k = textKey(p);
    if (seenText.has(k)) continue;
    seenIds.add(p.id);
    seenText.add(k);
    out.push(p);
  }
  return out;
}

function searchTerms(profiles: ListeningProfile[]): string[] {
  const filter = buildPreFilter(profiles);
  const terms = new Set(filter.atoms.map(atomToSearchString));
  return [...terms].slice(0, 40);
}

/** Match every stored, enriched post against one profile (used after a save and after feedback). */
export function rematchProfile(data: StoreData, profile: ListeningProfile, sinceMs?: number): Match[] {
  // Keep each surviving match's original createdAt so a re-match never re-triggers alerts.
  const firstSeen = new Map<string, string>();
  for (const id of Object.keys(data.matches)) {
    if (data.matches[id].profileId !== profile.id) continue;
    firstSeen.set(id, data.matches[id].createdAt);
    delete data.matches[id];
  }
  if (profile.status !== "active") return [];
  const compiled = compileProfile(profile);
  const learning = getLearning(data, profile.id);
  const out: Match[] = [];
  for (const post of Object.values(data.posts)) {
    if (sinceMs && Date.parse(post.postedAt) < sinceMs) continue;
    const e = data.enrichments[post.id];
    if (!e) continue;
    const m = matchPost(compiled, post, e, learning);
    if (m) {
      m.createdAt = firstSeen.get(m.id) ?? m.createdAt;
      data.matches[m.id] = m;
      out.push(m);
    }
  }
  return out;
}

/** Enrich stored posts that the given profiles could match but that were never enriched. */
async function enrichCandidates(data: StoreData, profiles: ListeningProfile[], sinceMs: number): Promise<number> {
  const filter = buildPreFilter(profiles);
  const pending = Object.values(data.posts).filter(
    (p) => needsEnrichment(data.enrichments[p.id]) && Date.parse(p.postedAt) >= sinceMs && filter.test(p, makeDoc(p)),
  );
  const enriched = await enrichPosts(pending.slice(0, 200));
  for (const e of enriched) data.enrichments[e.postId] = e;
  return enriched.length;
}

export interface IngestOptions {
  demo?: boolean;
  sinceHours?: number;
  /** Send alerts/digests after matching (default true). */
  alerts?: boolean;
}

export async function runIngest(opts: IngestOptions = {}): Promise<IngestRun> {
  const startedAt = new Date().toISOString();
  const snapshot = await read();
  const profiles = snapshot.profiles.filter((p) => p.status === "active");
  const since = new Date(Date.now() - (opts.sinceHours ?? 24) * 3_600_000);
  const wanted = new Set(profiles.flatMap((p) => activeSources(p.config)));
  const terms = searchTerms(profiles);

  const fetched: Post[] = [];
  const connectorLog: IngestRun["connectors"] = [];
  if (opts.demo) {
    const posts = demoPosts();
    fetched.push(...posts);
    connectorLog.push({ network: "demo", name: "Demo posts", fetched: posts.length });
  } else if (terms.length > 0) {
    await Promise.all(
      CONNECTORS.filter((c) => wanted.has(c.network)).map(async (c) => {
        const reason = c.unavailableReason();
        if (reason) {
          connectorLog.push({ network: c.network, name: c.name, fetched: 0, error: reason });
          return;
        }
        try {
          const posts = await c.fetch({ terms, since, limit: 50 });
          fetched.push(...posts);
          connectorLog.push({ network: c.network, name: c.name, fetched: posts.length });
        } catch (e) {
          connectorLog.push({ network: c.network, name: c.name, fetched: 0, error: (e as Error).message });
        }
      }),
    );
  }

  return mutate(async (data) => {
    const fresh = dedupe(fetched, data.posts);
    for (const p of fresh) data.posts[p.id] = p;

    // Cheap pre-filter on new posts, then AI enrichment only for survivors.
    const filter = buildPreFilter(data.profiles);
    const candidates = opts.demo ? fresh : fresh.filter((p) => filter.test(p, makeDoc(p)));
    const enriched = await enrichPosts(candidates.filter((p) => needsEnrichment(data.enrichments[p.id])));
    for (const e of enriched) data.enrichments[e.postId] = e;

    let matchCount = 0;
    for (const profile of data.profiles) {
      if (profile.status !== "active") continue;
      const compiled = compileProfile(profile);
      const learning = getLearning(data, profile.id);
      for (const post of fresh) {
        const e = data.enrichments[post.id];
        if (!e) continue;
        const m = matchPost(compiled, post, e, learning);
        if (m) {
          data.matches[m.id] = m;
          matchCount++;
        }
      }
    }

    // Labels from an older offline classifier (or offline labels once Claude is configured) are
    // redone in the background of each run; affected profiles are re-matched.
    const relabelled = await enrichCandidates(data, data.profiles.filter((p) => p.status === "active"), Date.now() - 90 * 86_400_000);
    if (relabelled > 0) for (const profile of data.profiles) rematchProfile(data, profile);

    const alerts = opts.alerts === false ? [] : await runAlerts(data);

    const run: IngestRun = {
      id: newId("run"),
      startedAt,
      finishedAt: new Date().toISOString(),
      fetched: fetched.length,
      newPosts: fresh.length,
      passedPreFilter: candidates.length,
      enriched: enriched.length,
      matches: matchCount,
      alerts: alerts.length,
      enrichModel: claudeEnabled() ? ENRICH_MODEL : HEURISTIC_MODEL,
      connectors: connectorLog,
    };
    data.runs.push(run);
    return run;
  });
}

/** Builder step 4: matches for an unsaved config against the last 7 days of stored posts. */
export async function previewProfile(profile: ListeningProfile): Promise<{ post: Post; match: Match; sentiment: string; intents: string[] }[]> {
  const sinceMs = Date.now() - PREVIEW_DAYS * 86_400_000;
  return mutate(async (data) => {
    await enrichCandidates(data, [profile], sinceMs);
    const compiled = compileProfile(profile);
    const results = [];
    for (const post of Object.values(data.posts)) {
      if (Date.parse(post.postedAt) < sinceMs) continue;
      const e = data.enrichments[post.id];
      if (!e) continue;
      const match = matchPost(compiled, post, e);
      if (match) results.push({ post, match, sentiment: e.sentiment, intents: e.intents });
    }
    results.sort((a, b) => b.match.relevance - a.match.relevance);
    return results.slice(0, 20);
  });
}

/** After a profile is created or edited: enrich what it could match, then rebuild its matches. */
export async function refreshProfileMatches(profileId: string): Promise<number> {
  return mutate(async (data) => {
    const profile = data.profiles.find((p) => p.id === profileId);
    if (!profile) return 0;
    await enrichCandidates(data, [profile], Date.now() - 90 * 86_400_000);
    return rematchProfile(data, profile).length;
  });
}
