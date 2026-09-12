-- Dual UTC-day Anthropic spend counters. Ingestion (classifyEvent /
-- generateAnalysis) and chat (chatAboutSignal + the cheap relevance Haiku)
-- must not share a ceiling: ingestion cost does not scale with user count;
-- chat cost does. Service-role write only; RLS on, no policies — same
-- fail-closed pattern as service_health_events.

create table if not exists public.anthropic_daily_usage (
  usage_date date not null,
  bucket text not null check (bucket in ('ingestion', 'chat')),
  estimated_usd numeric(12, 6) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  call_count integer not null default 0,
  warned_50 boolean not null default false,
  warned_90 boolean not null default false,
  chat_50pct_emailed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (usage_date, bucket)
);

alter table public.anthropic_daily_usage enable row level security;

comment on table public.anthropic_daily_usage is
  'Running UTC-day Anthropic spend estimates. Buckets: ingestion | chat. Service-role only.';
