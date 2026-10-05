-- PERS-Pn: alert cards currently say a signal matched a rule, but not *why* — which
-- of the rule's own filters (watchlist, commodity, region, forex) actually fired.
-- This column stores that breakdown once, at dispatch time, so both the chat delivery
-- (buildAlertBody) and the web Alerts card can render the same reason without
-- re-deriving it later from the rule + signal rows.
--
-- Purely additive and nullable: existing alerts_sent rows have no match_reason and
-- render exactly as before (no "why" line). Display/ordering only — never affects
-- whether an alert was sent.

alter table public.alerts_sent
  add column if not exists match_reason jsonb;

comment on column public.alerts_sent.match_reason is
  'Why the rule matched, for display only: { tier: 1|2|3, matched: { watchlist?, commodity?, region?, forex?: string[] } }. Tier 1 = signal asset on user watchlist, 2 = commodity/forex AND region both matched, 3 = matched on one of them. Never changes whether an alert was sent.';
