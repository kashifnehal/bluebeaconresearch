-- Create a profile trigger for every new user (Email or OAuth)
-- Uses ON CONFLICT DO NOTHING to safely handle duplicate calls (e.g. edge cases with OAuth)
-- Explicitly sets onboarding_completed = false so the callback redirect logic is reliable
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, plan_tier, onboarding_completed)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'plan_tier', 'free'),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger safely before re-creating
drop trigger if exists on_auth_user_created on auth.users;

-- Trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

