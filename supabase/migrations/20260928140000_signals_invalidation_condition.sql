-- #216 — "what would prove this signal wrong" field on public.signals.
--
-- classifyEvent() (apps/backend/src/services/claude.service.ts) now asks Claude
-- for a one-sentence, plain-language statement of what specific reported fact,
-- if it turned out to be false/unconfirmed/different, would undercut the
-- event's market-impact assessment — grounded in the article's own claim, not
-- a generic disclaimer or a probability score. Same nullable-on-heuristic-
-- fallback pattern as market_mechanism/materiality_reasoning (see migration
-- 20260913160000_signals_materiality_gate.sql): heuristicClassify() has no
-- real read of the article to ground this in and leaves it null.
--
-- UI: surfaced on the event detail page's Analysis tab only (data-testid
-- "invalidation-condition") — a deliberate scope decision, not shown on
-- SignalCard, the dashboard feed, or the quick-view drawer.

alter table public.signals
  add column if not exists invalidation_condition text;

comment on column public.signals.invalidation_condition is
  '#216: one-sentence, plain-language statement of what specific reported fact, if false/unconfirmed/different, would undercut this event''s market-impact assessment. Grounded in the article''s own claim, not a generic disclaimer or a probability score. Null on pre-column rows and on heuristic-fallback classifications that never computed it (no real article read to ground it in).';
