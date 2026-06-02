-- =====================================================================
-- AppLux MVP — Phase 7c ensure mobile persistence on signup
-- =====================================================================
-- Defensive re-apply + backfill. Closes two real-world failure modes:
--
--   1. A live project that ran the original 20260502120100 trigger but
--      never received 20260502120600 — every new signup since has been
--      writing a profile row with mobile = NULL. The client sends the
--      mobile in auth metadata correctly, but the old trigger drops it.
--
--   2. Even after 20260502120600 lands, profile rows created BEFORE it
--      still have mobile = NULL. The backfill in 20260502120600 only
--      canonicalises existing values; it does not pull mobile out of
--      auth.users.raw_user_meta_data, so historical rows stay broken.
--
-- Everything in this migration is idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Canonicalizer (no-op if already applied — same body)
-- ---------------------------------------------------------------------
create or replace function public.canonicalize_saudi_mobile(raw text)
returns text
language sql
immutable
as $$
  with src as (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d),
       stripped as (
         select case
           when d like '00966%' then substring(d from 6)
           when d like '966%'   then substring(d from 4)
           when d like '0%'     then substring(d from 2)
           else d
         end as d from src
       )
  select case when d ~ '^5[0-9]{8}$' then d else null end from stripped;
$$;

-- ---------------------------------------------------------------------
-- 2. CHECK constraint + index (idempotent)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_mobile_canonical'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_mobile_canonical
      check (mobile is null or mobile ~ '^5[0-9]{8}$');
  end if;
end $$;

create index if not exists profiles_mobile_idx on public.profiles(mobile);

-- ---------------------------------------------------------------------
-- 3. Re-apply the mobile-aware trigger function. Triggers reference
--    functions by name, so replacing the function updates the existing
--    `on_auth_user_created` trigger automatically — no need to drop /
--    recreate the trigger itself.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, mobile)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    public.canonicalize_saudi_mobile(
      nullif(new.raw_user_meta_data->>'mobile', '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Backfill historic rows. For every profile that currently has a
--    NULL mobile but whose auth.users record carries one in metadata,
--    copy + canonicalise it across. Only touches the broken rows;
--    rows that already have a mobile are left alone. Rows where the
--    metadata mobile won't canonicalise (foreign / malformed) are
--    skipped — leaving them NULL is correct, and the CHECK constraint
--    would otherwise reject them.
-- ---------------------------------------------------------------------
update public.profiles p
set mobile = public.canonicalize_saudi_mobile(u.raw_user_meta_data->>'mobile'),
    updated_at = now()
from auth.users u
where p.id = u.id
  and p.mobile is null
  and u.raw_user_meta_data->>'mobile' is not null
  and public.canonicalize_saudi_mobile(u.raw_user_meta_data->>'mobile') is not null;
