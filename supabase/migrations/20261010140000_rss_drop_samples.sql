-- claude/w16a — diagnostic store for relevance-filter drops (RSS, GNews, GDELT; see
-- drop-sample-store.ts). Lives in public (service_role has no USAGE on a custom schema). WRITTEN, NOT APPLIED — do not run until a founder decision
-- to turn it on (DROP_SAMPLE_STORE env flag, default off).

create table if not exists public.rss_drop_samples (
  id uuid primary key default gen_random_uuid(),
  feed text not null,
  tier text not null,
  reason text not null,
  shadow_groups text[],
  midword_only boolean not null default false,
  title text not null,
  summary_excerpt text,
  url text,
  title_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1,
  unique (feed, title_hash)
);

comment on table public.rss_drop_samples is 'retention: delete rows older than 14 days';

alter table public.rss_drop_samples enable row level security;
-- No policies — service role (which bypasses RLS) only.

revoke all on public.rss_drop_samples from anon, authenticated;
grant select, insert, update, delete on public.rss_drop_samples to service_role;
