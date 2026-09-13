-- #139/#141 — post-classify materiality gate columns on public.signals.
--
-- Context (docs/claude_project/85_SIGNAL_INGESTION_FILTER_SEVERITY_AUDIT.md,
-- claude/85_..., "Verdict"): the live pipeline classifies every article that
-- survives the keyword filter and unconditionally writes it into `signals` --
-- there has never been a "this does not mean anything, drop it" step after
-- classification. A 14-day audit found 63% of signals sitting at severity 1-4,
-- many with empty commodity_impacts and Claude's own summary saying "no market
-- impact." This migration adds the columns the new gate (claude.service.ts
-- classifyEvent(), enforced in each collector -- see #139/#141 commit) needs to
-- record WHY a story passed or was rejected, not just a bare severity number.
--
-- materiality_pass / materiality_reasoning are the gate itself: going forward,
-- a story with materiality_pass = false never gets a `signals` row written at
-- all (the collector skips the insert entirely -- see gnews/gdelt/rss-collector,
-- acled-collector, reconciliation.ts). materiality_pass defaults to true and
-- backfills to true for existing rows deliberately -- this column only governs
-- FUTURE inserts; it does not retroactively hide anything already in the table.
--
-- relevance / novelty / event_category / market_mechanism / is_preview /
-- source_confirmation are new per-story fields Claude (or, more sparsely, the
-- heuristic fallback) now returns alongside severity/confidence, so a future UI
-- pass (#143, out of scope here) can show *why* a signal matters instead of
-- just a number.

alter table public.signals
  add column if not exists relevance real,
  add column if not exists novelty real,
  add column if not exists event_category text,
  add column if not exists market_mechanism text,
  add column if not exists is_preview boolean default false,
  add column if not exists source_confirmation text,
  add column if not exists materiality_pass boolean not null default true,
  add column if not exists materiality_reasoning text;

alter table public.signals
  add constraint signals_relevance_range
    check (relevance is null or (relevance >= 0 and relevance <= 1)),
  add constraint signals_novelty_range
    check (novelty is null or (novelty >= 0 and novelty <= 1)),
  add constraint signals_event_category_values
    check (event_category is null or event_category in (
      'armed_conflict_security',
      'supply_disruption_logistics',
      'sanctions_trade_policy',
      'production_output_decision',
      'central_bank_monetary_policy',
      'scheduled_economic_data',
      'official_statement_commentary',
      'elections_political_transition',
      'other_market_relevant'
    )),
  add constraint signals_source_confirmation_values
    check (source_confirmation is null or source_confirmation in ('official', 'reported', 'speculative'));

-- Rows that fail the gate going forward are never inserted (so this index stays
-- small/skewed toward true), but the frontend (#143) and any backfill/report
-- query will filter on this column constantly.
create index if not exists signals_materiality_pass_idx
  on public.signals (materiality_pass);

comment on column public.signals.relevance is
  '#139/#141 materiality gate: 0.0-1.0, how central the named commodity/currency/entity/geography actually is to the story (not just mentioned in passing). Nullable -- heuristic-fallback rows leave this null (heuristicClassify does not attempt to score it).';

comment on column public.signals.novelty is
  '#139/#141 materiality gate: 0.0-1.0, how new the information is vs. a repeat/rehash or a reminder of an already-known schedule. Claude is given a cheap v1 hint (was a same country/event_type signal already logged in the last 48h?) alongside the article text -- see hasSimilarRecentSignal() in apps/backend/src/lib/novelty-hint.ts. This is NOT semantic/paraphrase duplicate detection; that is separate future work. Nullable -- heuristic-fallback rows leave this null.';

comment on column public.signals.event_category is
  '#139/#141 materiality gate: one of 9 fixed categories (see CHECK constraint) describing what kind of event this is, independent of severity. Nullable -- heuristic-fallback rows leave this null.';

comment on column public.signals.market_mechanism is
  '#139/#141 materiality gate: short plain-language string explaining how this event could plausibly reach a commodity/currency/market (e.g. "Threat to tanker traffic through the Strait of Hormuz -> crude oil supply risk"). Null when no real mechanism exists in the story -- never invented. Nullable -- heuristic-fallback rows leave this null.';

comment on column public.signals.is_preview is
  '#139/#141 materiality gate: true ONLY when the story exclusively reminds the reader of a previously-known, already-scheduled event/date with no new claim, statement, or data attached (a pure "week ahead" / calendar-reminder story). False for any story reporting a new fact, statement, or claim -- even an unconfirmed one. A scheduled event''s actual release/decision is always false. Defaults to false.';

comment on column public.signals.source_confirmation is
  '#139/#141 materiality gate: one of official | reported | speculative -- what KIND of claim the story itself represents (a direct on-the-record statement/release vs. a sourced claim vs. unsourced commentary/analysis), not a judgment of whether the claim is true. Nullable -- heuristic-fallback rows leave this null.';

comment on column public.signals.materiality_pass is
  '#139/#141 materiality gate (the reject step the live pipeline never had): whether this story cleared BBR''s reasonable-investor-inspired materiality bar at classify time. Existing rows backfill to true (they already exist as signals; this column only governs FUTURE inserts -- collectors skip the signals insert entirely when a fresh classification returns materiality_pass = false, per apps/backend/src/lib/materiality-gate.ts). Not null, defaults true.';

comment on column public.signals.materiality_reasoning is
  '#139/#141 materiality gate: short plain-language string from the classifier (Claude or the heuristic fallback) explaining WHY this story passed or was rejected -- which specific criterion decided it, not just "not important." Nullable.';
