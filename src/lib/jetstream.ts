import { ingestPosts } from "./pipeline";
import { buildPreFilter, type PreFilter } from "./matcher";
import { activeSources } from "./profile";
import { makeDoc } from "./query";
import { read } from "./store";
import type { Post } from "./types";

/**
 * Real-time Bluesky through Jetstream, Bluesky's free public firehose of every new post (no key,
 * no approval). Each post is checked against the union pre-filter of the active profiles that
 * listen on Bluesky; the few that could match are buffered and handed to the normal pipeline
 * every BLUESKY_FLUSH_SECONDS (default 120), which labels, matches and sends real-time alerts.
 *
 * The stream resumes from its last cursor after a disconnect (Jetstream keeps a short replay
 * window). Author handles are resolved from the DID through plc.directory and cached.
 * Turn it off with BLUESKY_JETSTREAM=off.
 */

const URL_DEFAULT = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const MAX_BUFFER = 2000;

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    operation: string;
    collection: string;
    rkey: string;
    record?: {
      text?: string;
      createdAt?: string;
      langs?: string[];
      reply?: unknown;
      facets?: { features: { $type: string; uri?: string }[] }[];
      embed?: { $type?: string; external?: { uri: string }; images?: unknown[]; video?: unknown };
    };
  };
}

export interface JetstreamStatus {
  enabled: boolean;
  connected: boolean;
  received: number;
  kept: number;
  flushed: number;
  matches: number;
  lastEventAt?: string;
  lastFlushAt?: string;
  lastError?: string;
}

interface State {
  ws?: WebSocket;
  cursor?: number;
  buffer: Post[];
  filter?: PreFilter;
  status: JetstreamStatus;
  retryMs: number;
  timers: NodeJS.Timeout[];
}

const g = globalThis as typeof globalThis & { __earshotJetstream?: State };

export function jetstreamStatus(): JetstreamStatus {
  return g.__earshotJetstream?.status ?? { enabled: false, connected: false, received: 0, kept: 0, flushed: 0, matches: 0 };
}

/** Map one Jetstream create event to a Post (handle filled in later). Exported for tests. */
export function eventToPost(ev: JetstreamEvent): Post | null {
  const c = ev.commit;
  if (ev.kind !== "commit" || !c || c.operation !== "create" || c.collection !== "app.bsky.feed.post" || !c.record?.text) return null;
  const r = c.record;
  const links = new Set<string>();
  for (const f of r.facets ?? []) for (const feat of f.features) if (feat.uri) links.add(feat.uri);
  if (r.embed?.external?.uri) links.add(r.embed.external.uri);
  const postedAt = r.createdAt && !Number.isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt).toISOString() : new Date(ev.time_us / 1000).toISOString();
  return {
    id: `bluesky:${c.rkey}`,
    network: "bluesky",
    externalId: `at://${ev.did}/app.bsky.feed.post/${c.rkey}`,
    url: `https://bsky.app/profile/${ev.did}/post/${c.rkey}`,
    author: { handle: ev.did },
    text: r.text ?? "",
    lang: r.langs?.[0],
    postedAt,
    kind: r.reply ? "reply" : "original",
    media: r.embed?.images?.length || r.embed?.video ? [{ type: r.embed.video ? "video" : "image", url: `https://bsky.app/profile/${ev.did}/post/${c.rkey}` }] : [],
    links: [...links],
    engagement: {},
    ingestedAt: new Date().toISOString(),
  };
}

const handles = new Map<string, string>();

async function resolveHandle(did: string): Promise<string | null> {
  if (handles.has(did)) return handles.get(did)!;
  if (!did.startsWith("did:plc:")) return null;
  try {
    const res = await fetch(`https://plc.directory/${did}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const doc = (await res.json()) as { alsoKnownAs?: string[] };
    const handle = doc.alsoKnownAs?.find((a) => a.startsWith("at://"))?.slice(5) ?? null;
    if (handle) {
      if (handles.size > 20_000) handles.clear();
      handles.set(did, handle);
    }
    return handle;
  } catch {
    return null;
  }
}

async function refreshFilter(state: State): Promise<void> {
  const data = await read();
  const listening = data.profiles.filter((p) => p.status === "active" && activeSources(p.config).includes("bluesky"));
  state.filter = listening.length ? buildPreFilter(listening) : undefined;
}

async function flush(state: State): Promise<void> {
  if (state.buffer.length === 0) return;
  const batch = state.buffer.splice(0, state.buffer.length);
  await Promise.all(
    batch.map(async (p) => {
      const handle = await resolveHandle(p.author.handle);
      if (handle) {
        p.author = { handle, displayName: handle };
        p.url = `https://bsky.app/profile/${handle}/post/${p.externalId.split("/").pop()}`;
      }
    }),
  );
  try {
    const result = await ingestPosts(batch, { prefilter: true });
    state.status.flushed += batch.length;
    state.status.matches += result.matches;
    state.status.lastFlushAt = new Date().toISOString();
  } catch (e) {
    state.status.lastError = `flush failed: ${(e as Error).message}`;
    console.error("[jetstream]", state.status.lastError);
  }
}

function connect(state: State): void {
  const base = process.env.BLUESKY_JETSTREAM_URL || URL_DEFAULT;
  // Rewind a few seconds on reconnect so nothing is lost at the seam (dedupe drops repeats).
  const url = state.cursor ? `${base}&cursor=${state.cursor - 5_000_000}` : base;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = () => {
    state.status.connected = true;
    state.status.lastError = undefined;
    state.retryMs = 1000;
    console.log("[jetstream] connected");
  };
  ws.onmessage = (msg) => {
    state.status.received++;
    let ev: JetstreamEvent;
    try {
      ev = JSON.parse(String(msg.data)) as JetstreamEvent;
    } catch {
      return;
    }
    state.cursor = ev.time_us;
    state.status.lastEventAt = new Date(ev.time_us / 1000).toISOString();
    if (!state.filter) return;
    const post = eventToPost(ev);
    if (!post || !state.filter.test(post, makeDoc(post))) return;
    state.status.kept++;
    if (state.buffer.length < MAX_BUFFER) state.buffer.push(post);
  };
  ws.onerror = (e) => {
    state.status.lastError = (e as ErrorEvent).message || "connection error";
  };
  ws.onclose = () => {
    state.status.connected = false;
    const wait = state.retryMs;
    state.retryMs = Math.min(state.retryMs * 2, 60_000);
    setTimeout(() => connect(state), wait).unref?.();
  };
}

export function startJetstream(): void {
  if (g.__earshotJetstream || process.env.BLUESKY_JETSTREAM === "off") return;
  const state: State = {
    buffer: [],
    retryMs: 1000,
    timers: [],
    status: { enabled: true, connected: false, received: 0, kept: 0, flushed: 0, matches: 0 },
  };
  g.__earshotJetstream = state;
  const flushMs = Math.max(30, Number(process.env.BLUESKY_FLUSH_SECONDS ?? 120)) * 1000;
  void refreshFilter(state).then(() => connect(state));
  // Pick up profile edits within a minute.
  state.timers.push(setInterval(() => void refreshFilter(state), 60_000));
  state.timers.push(setInterval(() => void flush(state), flushMs));
  for (const t of state.timers) t.unref?.();
}
