import postgres from "postgres";
import { normalize, readDataFile, type Backend, type StoreData } from "./store";

/**
 * Postgres backend. Posts, enrichments and matches (the large, append-heavy parts) live in their
 * own tables and are written incrementally: after each change only new, replaced or removed rows
 * are sent. Everything else (accounts, profiles, feedback, notifications, run log...) is stored
 * as one small JSON record per section and rewritten only when its contents change.
 *
 * The server holds the full dataset in memory (a single process), so reads never hit the
 * database; Postgres is the durable copy, backed up by Railway.
 *
 * Rows are diffed by object identity, so code must replace post, enrichment and match objects
 * rather than edit them in place (the pipeline already does).
 */

const BIG = ["posts", "enrichments", "matches"] as const;
type BigTable = (typeof BIG)[number];
const SMALL = [
  "workspaces",
  "users",
  "memberships",
  "invites",
  "profiles",
  "versions",
  "feedback",
  "learning",
  "runs",
  "notifications",
  "alertState",
] as const;

const CHUNK = 500;

export const SCHEMA = `
create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists posts (
  id text primary key,
  data jsonb not null,
  posted_at timestamptz not null
);
create index if not exists posts_posted_at on posts (posted_at);
create table if not exists enrichments (
  post_id text primary key,
  data jsonb not null
);
create table if not exists matches (
  id text primary key,
  profile_id text not null,
  post_id text not null,
  data jsonb not null
);
create index if not exists matches_profile on matches (profile_id);
`;

function keyColumn(table: BigTable): string {
  return table === "enrichments" ? "post_id" : "id";
}

export function postgresBackend(url: string): Backend {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 30,
    onnotice: () => undefined,
    ssl: /sslmode=require/.test(url) ? "require" : undefined,
  });
  // What was last written, to compute the next diff.
  const lastRows: Record<BigTable, Map<string, unknown>> = { posts: new Map(), enrichments: new Map(), matches: new Map() };
  const lastSmall = new Map<string, string>();
  let ready: Promise<void> | null = null;

  const migrate = () => (ready ??= sql.unsafe(SCHEMA).then(() => undefined));

  async function writeBig(tx: postgres.TransactionSql, table: BigTable, rows: Record<string, unknown>): Promise<void> {
    const last = lastRows[table];
    const upserts: [string, unknown][] = [];
    for (const [id, row] of Object.entries(rows)) if (last.get(id) !== row) upserts.push([id, row]);
    const deletes: string[] = [];
    for (const id of last.keys()) if (!(id in rows)) deletes.push(id);

    for (let i = 0; i < upserts.length; i += CHUNK) {
      const chunk = upserts.slice(i, i + CHUNK);
      const ids = chunk.map(([id]) => id);
      // Sent as text and cast in SQL: a parameter typed jsonb would be JSON-encoded a second time.
    const json = chunk.map(([, row]) => JSON.stringify(row));
      if (table === "posts") {
        const dates = chunk.map(([, row]) => (row as { postedAt: string }).postedAt);
        await tx`insert into posts (id, data, posted_at)
          select id, data::jsonb, posted_at::timestamptz from unnest(${ids}::text[], ${json}::text[], ${dates}::text[]) as t(id, data, posted_at)
          on conflict (id) do update set data = excluded.data, posted_at = excluded.posted_at`;
      } else if (table === "enrichments") {
        await tx`insert into enrichments (post_id, data)
          select id, data::jsonb from unnest(${ids}::text[], ${json}::text[]) as t(id, data)
          on conflict (post_id) do update set data = excluded.data`;
      } else {
        const profiles = chunk.map(([, row]) => (row as { profileId: string }).profileId);
        const postIds = chunk.map(([, row]) => (row as { postId: string }).postId);
        await tx`insert into matches (id, profile_id, post_id, data)
          select id, profile_id, post_id, data::jsonb from unnest(${ids}::text[], ${profiles}::text[], ${postIds}::text[], ${json}::text[]) as t(id, profile_id, post_id, data)
          on conflict (id) do update set data = excluded.data, profile_id = excluded.profile_id, post_id = excluded.post_id`;
      }
    }
    for (let i = 0; i < deletes.length; i += CHUNK) {
      await tx`delete from ${tx(table)} where ${tx(keyColumn(table))} = any(${deletes.slice(i, i + CHUNK)}::text[])`;
    }
  }

  async function write(data: StoreData): Promise<void> {
    await migrate();
    await sql.begin(async (tx) => {
      for (const t of BIG) await writeBig(tx, t, data[t] as Record<string, unknown>);
      for (const key of SMALL) {
        const json = JSON.stringify(data[key]);
        if (lastSmall.get(key) === json) continue;
        await tx`insert into app_state (key, value, updated_at) values (${key}, (${json}::text)::jsonb, now())
          on conflict (key) do update set value = excluded.value, updated_at = now()`;
      }
    });
    // Only after the transaction commits do we treat these rows as written.
    for (const t of BIG) lastRows[t] = new Map(Object.entries(data[t] as Record<string, unknown>));
    for (const key of SMALL) lastSmall.set(key, JSON.stringify(data[key]));
  }

  return {
    name: "postgres",
    async load() {
      await migrate();
      const state = await sql<{ key: string; value: unknown }[]>`select key, value from app_state`;
      const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from posts`;
      if (state.length === 0 && count === 0) {
        // First start against an empty database: import the JSON file if there is one.
        const fromFile = await readDataFile();
        if (fromFile) {
          console.log(`[store] importing ${Object.keys(fromFile.posts).length} posts and ${fromFile.profiles.length} profiles from the data file`);
          await write(fromFile);
          return fromFile;
        }
      }
      const raw: Record<string, unknown> = {};
      for (const row of state) raw[row.key] = row.value;
      const data = normalize(raw as Partial<StoreData>);
      data.posts = {};
      data.enrichments = {};
      data.matches = {};
      for (const r of await sql<{ id: string; data: StoreData["posts"][string] }[]>`select id, data from posts`) data.posts[r.id] = r.data;
      for (const r of await sql<{ post_id: string; data: StoreData["enrichments"][string] }[]>`select post_id, data from enrichments`)
        data.enrichments[r.post_id] = r.data;
      for (const r of await sql<{ id: string; data: StoreData["matches"][string] }[]>`select id, data from matches`) data.matches[r.id] = r.data;
      for (const t of BIG) lastRows[t] = new Map(Object.entries(data[t] as Record<string, unknown>));
      for (const key of SMALL) lastSmall.set(key, JSON.stringify(data[key]));
      return data;
    },
    persist: write,
  };
}
