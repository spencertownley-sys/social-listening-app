import { promises as fs } from "fs";
import path from "path";
import { emptyLearning, type LearningState } from "./learning";
import type { ListeningProfile, ProfileVersion } from "./profile";
import type { Enrichment, Feedback, Match, Post } from "./types";

/**
 * Storage interface. The MVP ships a single-workspace JSON-file implementation so the app runs
 * with zero setup; `supabase/migrations/0001_init.sql` is the production schema the Supabase
 * adapter will implement against.
 */

export interface IngestRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  fetched: number;
  newPosts: number;
  passedPreFilter: number;
  enriched: number;
  matches: number;
  alerts?: number;
  enrichModel: string;
  connectors: { network: string; name: string; fetched: number; error?: string }[];
}

export interface AppNotification {
  id: string;
  profileId: string;
  kind: "realtime" | "spike" | "digest";
  title: string;
  body: string;
  postIds: string[];
  channels: string[]; // where it was delivered, e.g. ["in_app", "email"]
  createdAt: string;
  read: boolean;
}

export interface AlertState {
  lastDigestAt?: string;
  lastRealtimeAt?: string;
  lastSpikeAt?: string;
}

export interface StoreData {
  workspace: { id: string; name: string };
  profiles: ListeningProfile[];
  versions: ProfileVersion[];
  posts: Record<string, Post>;
  enrichments: Record<string, Enrichment>;
  matches: Record<string, Match>;
  feedback: Feedback[];
  learning: Record<string, LearningState>;
  runs: IngestRun[];
  notifications: AppNotification[];
  alertState: Record<string, AlertState>;
}

export const RETENTION_DAYS = 90;

function emptyData(): StoreData {
  return {
    workspace: { id: "ws_local", name: "My workspace" },
    profiles: [],
    versions: [],
    posts: {},
    enrichments: {},
    matches: {},
    feedback: [],
    learning: {},
    runs: [],
    notifications: [],
    alertState: {},
  };
}

const DATA_FILE = process.env.EARSHOT_DATA_FILE ?? path.join(process.cwd(), ".data", "earshot.json");

// Next.js gives pages and route handlers separate module instances, so the cache and write
// queue live on globalThis to keep every part of the server process on one copy.
const g = globalThis as typeof globalThis & { __earshotStore?: { cache: StoreData | null; queue: Promise<unknown> } };
const state = (g.__earshotStore ??= { cache: null, queue: Promise.resolve() });

async function load(): Promise<StoreData> {
  if (state.cache) return state.cache;
  try {
    state.cache = { ...emptyData(), ...JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ DATA_FILE, "utf8")) } as StoreData;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    state.cache = emptyData();
  }
  return state.cache;
}

function applyRetention(data: StoreData): void {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const [id, p] of Object.entries(data.posts)) {
    if (Date.parse(p.postedAt) < cutoff) {
      delete data.posts[id];
      delete data.enrichments[id];
    }
  }
  for (const [id, m] of Object.entries(data.matches)) if (!data.posts[m.postId]) delete data.matches[id];
  data.runs = data.runs.slice(-50);
  data.notifications = data.notifications.slice(-500);
}

async function persist(data: StoreData): Promise<void> {
  applyRetention(data);
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, DATA_FILE);
}

/** Read-only snapshot. */
export async function read(): Promise<StoreData> {
  await state.queue;
  return load();
}

/** Serialized read-modify-write. */
export function mutate<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const data = await load();
    const result = await fn(data);
    await persist(data);
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

export function getLearning(data: StoreData, profileId: string): LearningState {
  return data.learning[profileId] ?? emptyLearning(profileId);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** For tests. */
export function __resetStoreCache(): void {
  state.cache = null;
  state.queue = Promise.resolve();
}
