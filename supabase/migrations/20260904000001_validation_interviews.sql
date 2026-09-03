-- 20260904000001_validation_interviews.sql
-- Founder-internal validation-interview tracking (2026-09-04). Backs
-- claude/46_VALIDATION_REALITY_CHECK.md step 1 (10-15 real user interviews) with a
-- durable, queryable home instead of scattered notes — chosen over a spreadsheet
-- specifically so it can be joined against public.events funnel data later
-- (e.g. "did people who said they'd pay actually activate on the manual Stripe
-- Payment Link test", claude/51_BILLING_ACTIVATION_PROMPTS.md §1).
--
-- This is NOT user-facing data. It is written and read only via the Supabase table
-- editor / service-role tooling. No public API route exposes it. RLS is enabled
-- with zero policies, so only the service role (which bypasses RLS) can touch it —
-- same lock-down shape used for other founder-internal tables.

create table if not exists public.validation_interviews (
  id uuid primary key default gen_random_uuid(),
  contacted_at timestamptz,
  -- Matches the persona table in claude/47_USER_SEGMENTS_AND_MARKET_SCOPE.md §1.
  segment text check (segment in (
    'futures_trader',
    'forex_trader',
    'equity_trader',
    'smb_importer',
    'fund_analyst',
    'algo_builder'
  )),
  interview_completed boolean not null default false,
  shown_product boolean not null default false,
  -- Free text: what they actually said/did, not a score.
  reaction text,
  would_pay boolean,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.validation_interviews enable row level security;
-- Intentionally no policies: service-role only.
