-- Reliability/trust fix, 2026-09-12 — classification_method flag.
--
-- Distinguishes signals actually classified by a real Claude API call from ones
-- produced by ClaudeService.heuristicClassify()'s keyword-based fallback (used
-- when Claude is unavailable — API error, or currently, low Anthropic credit).
-- Lets the frontend eventually show an "auto-classified, unverified" indicator
-- instead of presenting every signal with the same implied confidence. Set going
-- forward by classifyEvent() in claude.service.ts based on which code path
-- actually produced the result (see ClassificationResult.classificationMethod).
--
-- classification_method_inferred distinguishes that accurate, real-time flag
-- (inferred = false, set at classification time) from the one-time best-effort
-- backfill below for historical rows that predate this column (inferred = true)
-- — a confidence-pattern guess, not a record of how the row was actually
-- classified.
alter table public.signals
  add column if not exists classification_method text
    check (classification_method in ('claude', 'heuristic')),
  add column if not exists classification_method_inferred boolean not null default false;

comment on column public.signals.classification_method is
  'Which path produced this signal''s classification: claude (real Anthropic API call succeeded) or heuristic (keyword fallback in ClaudeService.heuristicClassify, used on API error/no credit). NULL = predates this column and did not match the one-time backfill heuristic below. Heuristic severity is capped at 6 going forward (see heuristicClassify) -- do not trust severity > 6 on a heuristic row.';

comment on column public.signals.classification_method_inferred is
  'true only for the one-time historical backfill below (best-effort confidence-pattern inference, not an authoritative record of how the row was originally classified); false for every row classified going forward, where classification_method is set directly by classifyEvent() at write time.';

create index if not exists signals_classification_method_idx
  on public.signals (classification_method);

-- One-time best-effort backfill for historical rows (runs once, at migration time).
-- heuristicClassify()'s dynamicConfidence formula
-- (min(0.9, 0.55 + matchedCategories * 0.07), matchedCategories in 0..5) can only
-- ever produce exactly these six 2-decimal values: 0.55, 0.62, 0.69, 0.76, 0.83,
-- 0.90. A real Claude response landing on one of these to two decimal places by
-- coincidence is unlikely. Rows matching are marked 'heuristic' + inferred = true.
-- Everything else is left NULL (unknown) rather than guessed as 'claude' --
-- absence of the heuristic signature is not positive evidence of a real Claude
-- call (e.g. this formula may not have existed in its current form for the full
-- history of the table).
update public.signals
set classification_method = 'heuristic',
    classification_method_inferred = true
where classification_method is null
  and confidence in (0.55, 0.62, 0.69, 0.76, 0.83, 0.90);
