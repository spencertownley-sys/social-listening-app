-- Earshot: core data model (PRD "System architecture and data model").
-- Posts, authors and enrichments are shared across workspaces (ingested once for everyone);
-- profiles, matches, feedback and alerts are private to a workspace via row-level security.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------------------------------------
-- Accounts

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'creator', 'pro', 'agency')),
  seats int not null default 1,
  profile_limit int not null default 1,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC'
);

-- Membership check used by every policy below. SECURITY DEFINER so policies on
-- workspace_members itself don't recurse.
create or replace function public.is_member(ws uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and case min_role
            when 'viewer' then true
            when 'editor' then m.role in ('owner', 'editor')
            else m.role = 'owner'
          end
  );
$$;

-- ------------------------------------------------------------------------------------------
-- Listening profiles (config is the JSON documented in docs/PRD.md and src/lib/profile.ts)

create table public.listening_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  version int not null default 1,
  config jsonb not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.listening_profiles (workspace_id);

create table public.profile_versions (
  profile_id uuid not null references public.listening_profiles (id) on delete cascade,
  version int not null,
  config jsonb not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (profile_id, version)
);

-- Per-profile learned state (token weights, muted authors, sentiment corrections).
create table public.profile_learning (
  profile_id uuid primary key references public.listening_profiles (id) on delete cascade,
  token_weights jsonb not null default '{}',
  muted_authors text[] not null default '{}',
  sentiment_overrides jsonb not null default '{}',
  feedback_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------
-- Shared ingest (written by workers with the service role only)

create table public.connectors (
  network text primary key,
  auth_type text not null,
  rate_limit_per_min int,
  health text not null default 'unknown' check (health in ('ok', 'degraded', 'down', 'unknown')),
  last_ok_at timestamptz,
  last_error text
);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  handle text not null,
  display_name text,
  follower_count int,
  bot_score real,
  verified boolean not null default false,
  account_created_at timestamptz,
  unique (network, handle)
);

create table public.posts (
  id text primary key,                  -- `${network}:${external_id}`
  network text not null,
  external_id text not null,
  author_id uuid references public.authors (id),
  url text not null,
  title text,
  text text not null,
  lang text,
  country text,
  kind text not null default 'original' check (kind in ('original', 'reply', 'repost')),
  media jsonb not null default '[]',
  links text[] not null default '{}',
  engagement jsonb not null default '{}',
  posted_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  deleted_at timestamptz,               -- platform deletion signal; purge job removes the row
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || text)) stored,
  unique (network, external_id)
);
create index on public.posts (posted_at desc);
create index on public.posts using gin (search);

create table public.enrichments (
  post_id text primary key references public.posts (id) on delete cascade,
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  sentiment_confidence real not null,
  emotions text[] not null default '{}',
  intents text[] not null default '{}',
  topics text[] not null default '{}',
  embedding vector(1024),
  model text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------
-- Per-workspace results

create table public.matches (
  profile_id uuid not null references public.listening_profiles (id) on delete cascade,
  post_id text not null references public.posts (id) on delete cascade,
  profile_version int not null,
  reasons jsonb not null,               -- [{kind, detail}] -> "why this matched"
  relevance smallint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);
create index on public.matches (profile_id, created_at desc);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.listening_profiles (id) on delete cascade,
  post_id text not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) default auth.uid(),
  action text not null check (action in ('relevant', 'not_relevant', 'wrong_sentiment', 'mute_author', 'more_like_this')),
  corrected_sentiment text check (corrected_sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  created_at timestamptz not null default now()
);

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.listening_profiles (id) on delete cascade,
  type text not null check (type in ('digest', 'realtime', 'spike')),
  cadence text check (cadence in ('hourly', 'daily', 'weekly')),
  threshold real,
  channels text[] not null default '{in_app,email}',
  quiet_hours jsonb,
  max_per_day int not null default 20
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.alert_rules (id) on delete cascade,
  channel text not null,
  sent_at timestamptz not null default now(),
  post_ids text[] not null default '{}'
);

-- Connected-account OAuth tokens (Facebook pages, Instagram business, ...). Encrypted with
-- pgsodium / Vault before insert; never selectable by clients.
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  network text not null,
  external_account_id text not null,
  token_ciphertext bytea not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------
-- Row-level security

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_settings enable row level security;
alter table public.listening_profiles enable row level security;
alter table public.profile_versions enable row level security;
alter table public.profile_learning enable row level security;
alter table public.connectors enable row level security;
alter table public.authors enable row level security;
alter table public.posts enable row level security;
alter table public.enrichments enable row level security;
alter table public.matches enable row level security;
alter table public.feedback enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.connected_accounts enable row level security;

create policy ws_read on public.workspaces for select using (public.is_member(id));
create policy ws_insert on public.workspaces for insert with check (owner_id = auth.uid());
create policy ws_update on public.workspaces for update using (public.is_member(id, 'owner'));

create policy members_read on public.workspace_members for select using (public.is_member(workspace_id));
create policy members_manage on public.workspace_members for all using (public.is_member(workspace_id, 'owner'));
-- The workspace creator adds themselves as the first (owner) member.
create policy members_bootstrap on public.workspace_members for insert with check (
  user_id = auth.uid() and role = 'owner'
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create policy settings_own on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy profiles_read on public.listening_profiles for select using (public.is_member(workspace_id));
create policy profiles_write on public.listening_profiles for all
  using (public.is_member(workspace_id, 'editor')) with check (public.is_member(workspace_id, 'editor'));

create policy versions_read on public.profile_versions for select
  using (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id)));
create policy learning_read on public.profile_learning for select
  using (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id)));

-- Shared ingest tables: readable by any signed-in user only through their matches.
create policy posts_via_match on public.posts for select using (
  exists (select 1 from public.matches m join public.listening_profiles p on p.id = m.profile_id
          where m.post_id = posts.id and public.is_member(p.workspace_id)));
create policy enrichments_via_match on public.enrichments for select using (
  exists (select 1 from public.matches m join public.listening_profiles p on p.id = m.profile_id
          where m.post_id = enrichments.post_id and public.is_member(p.workspace_id)));
create policy authors_via_match on public.authors for select using (
  exists (select 1 from public.posts po join public.matches m on m.post_id = po.id
          join public.listening_profiles p on p.id = m.profile_id
          where po.author_id = authors.id and public.is_member(p.workspace_id)));
create policy connectors_read on public.connectors for select using (auth.role() = 'authenticated');

create policy matches_read on public.matches for select
  using (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id)));

create policy feedback_read on public.feedback for select
  using (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id)));
create policy feedback_insert on public.feedback for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id, 'editor')));

create policy alert_rules_rw on public.alert_rules for all
  using (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id, 'editor')))
  with check (exists (select 1 from public.listening_profiles p where p.id = profile_id and public.is_member(p.workspace_id, 'editor')));
create policy alert_events_read on public.alert_events for select using (
  exists (select 1 from public.alert_rules r join public.listening_profiles p on p.id = r.profile_id
          where r.id = rule_id and public.is_member(p.workspace_id)));

-- connected_accounts: no client policies at all (service role only).

-- ------------------------------------------------------------------------------------------
-- Retention (PRD: raw posts 90 days). Schedule with pg_cron: select cron.schedule('purge-posts', '17 3 * * *', 'select public.purge_old_posts()');

create or replace function public.purge_old_posts() returns void language sql security definer set search_path = public as $$
  delete from posts where posted_at < now() - interval '90 days' or deleted_at is not null;
$$;
