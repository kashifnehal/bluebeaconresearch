-- Discord webhook channel on user_channels (webhook-URL-paste only; no bot/OAuth).
-- Existing RLS policy user_channels_all_own (FOR ALL, using/with check
-- user_id = auth.uid()) already covers new columns on the same row — no
-- policy change. alert_rules.channels stays an unconstrained text[].

alter table public.user_channels
  add column if not exists discord_webhook_url text,
  add column if not exists discord_connected_at timestamptz;
