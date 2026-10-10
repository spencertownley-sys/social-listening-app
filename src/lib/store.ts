import { promises as fs } from "fs";
import path from "path";
import { emptyLearning, type LearningState } from "./learning";
import type { ListeningProfile, ProfileVersion } from "./profile";
import type { Enrichment, Feedback, Match, Post } from "./types";

/**
 * Storage. The whole dataset lives in memory (one server process) and is persisted after every
 * write by one of two backends:
 *  - Postgres (when DATABASE_URL is set; the hosted site): posts, labels and matches in their own
 *    tables, saved incrementally; everything else as small JSON records. See store-pg.ts.
 *  - A JSON file (local development and tests): EARSHOT_DATA_FILE, default .data/earshot.json.
 * On first start against an empty database, an existing JSON file is imported automatically.
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

export type Role = "owner" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  /** Bumped to sign the user out everywhere (sessions carry the version they were issued with). */
  sessionVersion: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface Membership {
  workspaceId: string;
  userId: string;
  role: Role;
}

export interface Invite {
  id: string;
  tokenHash: string;
  workspaceId: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy?: string;
  usedAt?: string;
}

export interface StoreData {
  workspaces: Workspace[];
  users: User[];
  memberships: Membership[];
  invites: Invite[];
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

/** The workspace that existed before accounts; the first account takes it over. */
export const DEFAULT_WORKSPACE_ID = "ws_local";

export function emptyData(): StoreData {
  return {
    workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: "My workspace", createdAt: new Date().toISOString() }],
    users: [],
    memberships: [],
    invites: [],
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

/** Fill in sections added after a store was first written (older files/rows). */
export function normalize(raw: Partial<StoreData> & { workspace?: { id: string; name: string } }): StoreData {
  const base = emptyData();
  const data = { ...base, ...raw } as StoreData & { workspace?: { id: string; name: string } };
  if (raw.workspace && !raw.workspaces) {
    data.workspaces = [{ id: raw.workspace.id, name: raw.workspace.name, createdAt: new Date().toISOString() }];
  }
  delete data.workspace;
  return data;
}

export function applyRetention(data: StoreData): void {
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
  const now = Date.now();
  data.invites = data.invites.filter((i) => Date.parse(i.expiresAt) > now - 30 * 86_400_000);
}

export interface Backend {
  name: "file" | "postgres";
  load(): Promise<StoreData>;
  persist(data: StoreData): Promise<void>;
}

export const DATA_FILE = process.env.EARSHOT_DATA_FILE ?? path.join(process.cwd(), ".data", "earshot.json");

export async function readDataFile(): Promise<StoreData | null> {
  try {
    return normalize(JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ DATA_FILE, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

const fileBackend: Backend = {
  name: "file",
  async load() {
    return (await readDataFile()) ?? emptyData();
  },
  async persist(data) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, DATA_FILE);
  },
};

// Next.js gives pages and route handlers separate module instances, so the cache, backend and
// write queue live on globalThis to keep every part of the server process on one copy.
const g = globalThis as typeof globalThis & {
  __earshotStore?: { cache: StoreData | null; queue: Promise<unknown>; backend: Backend | null };
};
const state = (g.__earshotStore ??= { cache: null, queue: Promise.resolve(), backend: null });

async function backend(): Promise<Backend> {
  if (!state.backend) {
    if (process.env.DATABASE_URL) {
      const { postgresBackend } = await import("./store-pg");
      state.backend = postgresBackend(process.env.DATABASE_URL);
    } else {
      state.backend = fileBackend;
    }
  }
  return state.backend;
}

export async function storageBackendName(): Promise<Backend["name"]> {
  return (await backend()).name;
}

async function load(): Promise<StoreData> {
  if (!state.cache) state.cache = await (await backend()).load();
  return state.cache;
}

async function persist(data: StoreData): Promise<void> {
  applyRetention(data);
  await (await backend()).persist(data);
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
  state.backend = null;
}
