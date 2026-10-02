-- Telegram inline-keyboard alert feedback (Useful / Not useful / Mute topic).
-- Written only by apps/backend/src/routes/telegram.ts's callback_query handler via
-- service role, after it verifies the answering chat owns the alerts_sent row
-- (user_channels.telegram_chat_id -> alerts_sent.user_id). Same RLS shape as
-- alerts_sent in 20260101000011_rls_remediation.sql: SELECT-own only, no
-- insert/update/delete policy for authenticated — all writes are service-role.
--
-- "mute_topic" records feedback only in this version. It must NOT change
-- alert_rules or thresholds (doc 64) — no trigger/function does so here.

create table if not exists public.alert_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alerts_sent_id uuid not null references public.alerts_sent(id) on delete cascade,
  value text not null check (value in ('useful', 'not_useful', 'mute_topic')),
  created_at timestamptz not null default now()
);

create index if not exists alert_feedback_user_created_idx
  on public.alert_feedback (user_id, created_at desc);

create index if not exists alert_feedback_alerts_sent_idx
  on public.alert_feedback (alerts_sent_id);

alter table public.alert_feedback enable row level security;

drop policy if exists "alert_feedback_select_own" on public.alert_feedback;
create policy "alert_feedback_select_own"
on public.alert_feedback
for select
to authenticated
using (user_id = (select auth.uid()));

comment on table public.alert_feedback is
  'Telegram inline-keyboard feedback (useful/not_useful/mute_topic) on alerts_sent rows. Insert-only via service role from the telegram webhook callback_query handler. mute_topic records feedback only -- does not change alert_rules/thresholds (doc 64).';
