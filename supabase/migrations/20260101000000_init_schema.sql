-- Phase 0 (missing piece): Core schema for Blue Beacon Research
-- This migration creates the tables described in the blueprint so Phase 2+ code can run locally.

-- Extensions
create extension if not exists "uuid-ossp";

-- USERS & AUTH
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  plan_tier text not null default 'pro' check (plan_tier in ('free','analyst','pro','api')),
  stripe_customer_id text,
  onboarding_completed boolean not null default false,
  push_tokens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  regions text[] not null default '{}',
  commodities text[] not null default '{}',
  min_severity int not null default 7 check (min_severity between 1 and 10),
  timezone text not null default 'UTC',
  quiet_start time,
  quiet_end time,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  email_frequency text not null default 'immediate' check (email_frequency in ('immediate','hourly','daily')),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- EVENTS & SIGNALS
create table if not exists public.raw_events (
  id uuid primary key default uuid_generate_v4(),
  source text not null check (source in ('gdelt','acled','newsapi')),
  external_id text,
  title text,
  summary text,
  country text,
  lat double precision,
  lng double precision,
  event_type text,
  event_date timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, external_id)
);

create table if not exists public.signals (
  id uuid primary key default uuid_generate_v4(),
  raw_event_ids uuid[] not null default '{}',
  title text not null,
  summary text not null,
  ai_analysis text,
  severity int not null check (severity between 1 and 10),
  confidence double precision not null check (confidence between 0 and 1),
  event_type text,
  country text,
  region text,
  lat double precision,
  lng double precision,
  sources_count int not null default 1,
  commodity_impacts jsonb not null default '[]'::jsonb,
  sanctions_matches jsonb not null default '[]'::jsonb,
  is_breaking boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commodity_prices (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  price double precision,
  change_24h double precision,
  change_pct_24h double precision,
  high_24h double precision,
  low_24h double precision,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(symbol, fetched_at)
);

-- ALERTS
create table if not exists public.alert_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  regions text[] not null default '{}',
  commodities text[] not null default '{}',
  min_severity int not null default 8 check (min_severity between 1 and 10),
  channels text[] not null default '{telegram}',
  frequency text not null default 'immediate' check (frequency in ('immediate','hourly','daily')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_triggered_at timestamptz
);

create table if not exists public.alerts_sent (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete set null,
  signal_id uuid not null references public.signals(id) on delete cascade,
  channel text,
  status text not null default 'queued' check (status in ('queued','delivered','failed')),
  delivered_at timestamptz,
  outcome_direction text,
  outcome_price_change double precision,
  created_at timestamptz not null default now()
);

-- SAVED & WATCHLIST
create table if not exists public.saved_signals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique(user_id, signal_id)
);

create table if not exists public.watchlist_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null,
  alert_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, symbol)
);

-- BACKTESTING
create table if not exists public.backtest_cache (
  id uuid primary key default uuid_generate_v4(),
  cache_key text not null unique,
  results jsonb not null,
  total_events int,
  accuracy_pct double precision,
  avg_move_pct double precision,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- API & WEBHOOKS
create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  key_hash text not null unique,
  key_prefix text not null,
  last_used_at timestamptz,
  call_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  name text,
  filters jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  payload jsonb not null,
  status_code int,
  response_body text,
  attempt_count int not null default 1,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

-- SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_tier text not null check (plan_tier in ('free','analyst','pro','api')),
  status text not null check (status in ('active','canceled','past_due')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- INDEXES (critical for performance)
create index if not exists idx_signals_severity on public.signals (severity desc);
create index if not exists idx_signals_region on public.signals (region);
create index if not exists idx_signals_created on public.signals (created_at desc);
create index if not exists idx_signals_fulltext on public.signals using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'')));
create index if not exists idx_commodity_prices_symbol on public.commodity_prices (symbol, fetched_at desc);
create index if not exists idx_alerts_sent_user on public.alerts_sent (user_id, created_at desc);
create index if not exists idx_raw_events_dedup on public.raw_events (external_id, source);

