-- Split from 012_reliability_indexes_and_cleanup.sql (2026-08-29 baseline).
-- Parts 2-4: already applied live 2026-08-19, backfilled here for tracking only.

create index if not exists idx_alert_rules_user_id on public.alert_rules (user_id);
create index if not exists idx_api_keys_user_id on public.api_keys (user_id);
create index if not exists idx_webhook_endpoints_user_id on public.webhook_endpoints (user_id);
create index if not exists idx_webhook_deliveries_endpoint_id on public.webhook_deliveries (endpoint_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);

create index if not exists idx_signals_commodity_impacts on public.signals using gin (commodity_impacts jsonb_path_ops);

create unique index if not exists idx_signals_raw_event_ids_unique on public.signals (raw_event_ids);
