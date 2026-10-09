-- Gate-shadow prompt experiment (see apps/backend/src/lib/gate-shadow.ts and
-- the fire-and-forget hook in claude.service.ts). Records, for a sample of
-- live materiality-gate calls, what a revised prompt ("v2-channels-1") would
-- have decided, WITHOUT changing the live verdict. Written NOT APPLIED —
-- see docs/brain/16_MIGRATION_CHECKLIST.md.

create schema if not exists internal_ops;

create table if not exists internal_ops.gate_shadow_results (
  id uuid primary key default gen_random_uuid(),
  raw_event_id uuid not null,
  prompt_version text not null,
  live_verdict text not null,
  live_reason text,
  shadow_verdict text not null,
  shadow_reason text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now(),
  unique (raw_event_id, prompt_version)
);

alter table internal_ops.gate_shadow_results enable row level security;
-- No policies — service-role only, same fail-closed pattern as
-- public.anthropic_daily_usage / public.service_health_events.

comment on table internal_ops.gate_shadow_results is
  'Shadow materiality-gate prompt experiment results. Never read by any live classification path.';

-- Extend the existing anthropic_daily_usage bucket CHECK so the shadow
-- experiment's own budget bucket (see getDailyBudgetUsd("shadow") in
-- anthropic-budget.ts) can actually record usage under its own cap, fully
-- separate from the "ingestion" bucket real classification uses.
alter table public.anthropic_daily_usage
  drop constraint if exists anthropic_daily_usage_bucket_check;

alter table public.anthropic_daily_usage
  add constraint anthropic_daily_usage_bucket_check
  check (bucket in ('ingestion', 'chat', 'shadow'));
