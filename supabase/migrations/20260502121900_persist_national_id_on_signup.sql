-- =====================================================================
-- Persist National ID on signup
-- =====================================================================
-- The customer registration form collects National ID at account
-- creation. It arrives in auth.users.raw_user_meta_data->>'national_id'
-- via the signUp metadata. The original handle_new_auth_user trigger
-- (20260502120800_ensure_mobile_persistence.sql) only copied full_name,
-- email, and mobile onto the profile row — National ID was dropped.
--
-- This migration extends the trigger so the National ID is persisted
-- atomically on signup, alongside the existing fields. Idempotent.
-- =====================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, mobile, national_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    public.canonicalize_saudi_mobile(
      nullif(new.raw_user_meta_data->>'mobile', '')
    ),
    nullif(new.raw_user_meta_data->>'national_id', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill: any customer profile created since the previous trigger
-- ran whose auth.users metadata carries a national_id should pick it
-- up here. Skips rows that already have a national_id so the
-- migration is safe to re-run.
update public.profiles p
set national_id = nullif(u.raw_user_meta_data->>'national_id', ''),
    updated_at = now()
from auth.users u
where p.id = u.id
  and p.national_id is null
  and u.raw_user_meta_data->>'national_id' is not null
  and u.raw_user_meta_data->>'national_id' <> '';
