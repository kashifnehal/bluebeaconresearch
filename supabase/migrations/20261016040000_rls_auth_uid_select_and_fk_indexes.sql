-- Wrap auth.uid() in a scalar subquery so the planner evaluates it once per statement.
-- The comparisons match the policies read from production on 2026-10-16.
-- Written, not applied in this change. Does not drop any index.

alter policy "feedback_submissions_insert_own"
  on public.feedback_submissions
  with check (user_id = (select auth.uid()));

alter policy "feedback_submissions_select_own"
  on public.feedback_submissions
  using (user_id = (select auth.uid()));

alter policy "signal_chat_messages_insert_own"
  on public.signal_chat_messages
  with check (user_id = (select auth.uid()));

alter policy "signal_chat_messages_select_own"
  on public.signal_chat_messages
  using (user_id = (select auth.uid()));

alter policy "user_sessions_delete_own"
  on public.user_sessions
  using ((select auth.uid()) = user_id);

alter policy "user_sessions_insert_own"
  on public.user_sessions
  with check ((select auth.uid()) = user_id);

alter policy "user_sessions_select_own"
  on public.user_sessions
  using ((select auth.uid()) = user_id);

alter policy "waitlist_select_own"
  on public.waitlist
  using ((select auth.uid()) = user_id);

-- These tables have under 200 rows. The gain is small and the cost is small.
create index if not exists alerts_sent_rule_id_idx on public.alerts_sent (rule_id);
create index if not exists alerts_sent_signal_id_idx on public.alerts_sent (signal_id);
create index if not exists saved_signals_signal_id_idx on public.saved_signals (signal_id);
create index if not exists signal_chat_messages_user_id_idx on public.signal_chat_messages (user_id);
create index if not exists waitlist_user_id_idx on public.waitlist (user_id);
create index if not exists webhook_deliveries_signal_id_idx on public.webhook_deliveries (signal_id);
