-- #155 — minimal in-app feedback / bug reports (not live chat).
-- Users insert their own rows from the Help page form. Founder reads via
-- service-role / table editor. Chosen over Resend because the web app has no
-- RESEND_API_KEY (that key lives on Railway workers for digest/auth SMTP).

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  email text,
  page_context text,
  created_at timestamptz not null default now(),
  constraint feedback_submissions_message_len
    check (char_length(message) between 10 and 4000),
  constraint feedback_submissions_email_len
    check (email is null or char_length(email) <= 320),
  constraint feedback_submissions_page_context_len
    check (page_context is null or char_length(page_context) <= 200)
);

create index if not exists feedback_submissions_user_created_idx
  on public.feedback_submissions (user_id, created_at desc);

alter table public.feedback_submissions enable row level security;

drop policy if exists "feedback_submissions_insert_own" on public.feedback_submissions;
create policy "feedback_submissions_insert_own"
on public.feedback_submissions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "feedback_submissions_select_own" on public.feedback_submissions;
create policy "feedback_submissions_select_own"
on public.feedback_submissions
for select
to authenticated
using (user_id = auth.uid());

comment on table public.feedback_submissions is
  'In-app Help/FAQ feedback and bug reports (#155). No live chat.';
