-- Alert-dispatcher per-user daily budget (doc 298 algorithm A2): a signal that clears
-- a user's alert_rules but is over MAX_ALERTS_PER_USER_PER_DAY is not sent now; it is
-- flagged so the next daily digest run (digest-sender.ts selectDigestSignalsForUser)
-- can pick it up instead of being silently dropped. See apps/backend/src/workers/
-- alert-dispatcher.ts for the budget logic itself.

alter table public.alerts_sent
  add column if not exists deferred_to_digest boolean not null default false;

alter table public.alerts_sent
  drop constraint if exists alerts_sent_status_check;

alter table public.alerts_sent
  add constraint alerts_sent_status_check
  check (status in ('queued', 'delivered', 'failed', 'deferred'));
