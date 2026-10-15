-- The latest-prices query orders by fetched_at alone and scanned the whole table.
-- The index was already created on 2026-10-16 in production. This file records it
-- and is safe to run again.
create index if not exists commodity_prices_fetched_at_idx
  on public.commodity_prices (fetched_at desc);
