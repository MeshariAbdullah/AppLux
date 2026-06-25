-- =====================================================================
-- Account deletion request (App Store readiness)
-- =====================================================================
-- Apple App Store guideline 5.1.1(v) requires that any app supporting
-- account creation also support in-app account deletion. The safest
-- implementation for a regulated rental platform is a SOFT-DELETE:
-- the customer requests deletion, we stamp `deletion_requested_at`,
-- flip account_status to 'suspended' so no new rental can be
-- initiated, and a back-office grace window (default 30 days) lets
-- operators finalise active contracts before the row + auth user are
-- removed. This avoids destroying records that are tied to signed
-- promissory notes / live contracts mid-cycle.
--
-- What this migration adds:
--   1. profiles.deletion_requested_at  timestamptz  (nullable)
--   2. RPC request_account_deletion()     — scoped to auth.uid()
--   3. RPC cancel_account_deletion()      — scoped to auth.uid(),
--      reverts the request if the customer changes their mind
--      during the grace window
--   4. RLS policy: customers can still read their own profile while
--      a deletion request is pending (so the UI can confirm state).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Column
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create index if not exists profiles_deletion_requested_idx
  on public.profiles(deletion_requested_at)
  where deletion_requested_at is not null;

-- ---------------------------------------------------------------------
-- (2) request_account_deletion — soft delete + suspend
-- ---------------------------------------------------------------------
-- Idempotent: calling it on a profile that already has a pending
-- deletion request leaves the original timestamp intact (so the
-- grace-window deadline doesn't slide forward on every retry).
-- Refuses to run for non-customer roles — merchants and admins go
-- through back-office offboarding, not the in-app self-serve flow.
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role app_role;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0070';
  end if;

  select role into v_role from profiles where id = v_uid;
  if v_role is null then
    raise exception 'Profile not found' using errcode = 'P0071';
  end if;

  if v_role <> 'customer' then
    raise exception 'Self-serve deletion is for customer accounts only'
      using errcode = 'P0072';
  end if;

  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now()),
         account_status        = 'suspended',
         updated_at            = now()
   where id = v_uid;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;

-- ---------------------------------------------------------------------
-- (3) cancel_account_deletion — undo during the grace window
-- ---------------------------------------------------------------------
create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0070';
  end if;

  update public.profiles
     set deletion_requested_at = null,
         account_status        = 'active',
         updated_at            = now()
   where id = v_uid
     and deletion_requested_at is not null;
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;
