-- =====================================================================
-- Customer account deletion — production repair + business-rule guards
-- =====================================================================
-- LIVE BUG: tapping "حذف الحساب" surfaces PGRST202 ("Could not find
-- the function public.request_account_deletion in the schema cache").
-- PGRST202 is PostgREST's function-not-found code: the RPC introduced
-- by 20260502122000_account_deletion_request.sql does NOT exist in the
-- production database (same class of drift as the missing
-- profiles_mobile_customer_unique index repaired by 123100 — the file
-- exists in the repo but was never applied to production).
--
-- This migration is a CONVERGENT REPAIR: it re-creates everything the
-- deletion flow needs (column, index, both RPCs, grants) idempotently,
-- so it is correct whether production has none, part, or all of
-- 20260502122000 — no historical migration is re-run.
--
-- It ALSO upgrades request_account_deletion() with server-side,
-- transactional business-rule guards (previously the only check was
-- role = 'customer'):
--
--   P0130  active rental contract (incl. overdue — status stays
--          'active' past end_date until closed)
--   P0131  contract journey in progress (status 'pending': accepted,
--          awaiting receipt-photo confirmation / activation)
--   P0132  open or escalated damage / non-return case
--   P0133  unsettled financial obligation (promissory note signed or
--          defaulted; note issuance is currently feature-flagged off,
--          so this guards legacy/back-office rows)
--
-- Deliberately ALLOWED (documented product decision, not an omission):
--   * offers awaiting review (invoice 'issued'/'viewed') — nothing has
--     been exchanged or signed; the offer simply expires. The invoice
--     row itself is preserved by the RESTRICT FK either way.
--   * purely historical records (contracts ended/cancelled, notes
--     settled, damage cases settled/dismissed).
--
-- DELETION MODEL (unchanged, verified): SOFT delete. The RPC stamps
-- profiles.deletion_requested_at and flips account_status to
-- 'suspended'; the client signs the user out. Hard removal is a
-- back-office step after the 30-day grace window. Physical deletion of
-- a customer with rental history is IMPOSSIBLE while records exist:
-- rental_invoices / rental_contracts / promissory_notes / damage_cases
-- all reference profiles(id) ON DELETE RESTRICT, so legal/audit
-- records can never be cascaded away by deleting the profile or the
-- auth user (profiles → auth.users is ON DELETE CASCADE, so the
-- RESTRICT chain also blocks deleting auth.users). Back-office
-- finalisation must therefore re-verify blockers; the database
-- enforces it regardless.
--
-- RACE SAFETY: the guards and the stamp run in one transaction with
-- the caller's profile row locked (SELECT ... FOR UPDATE), so
-- concurrent request/cancel calls serialize. A rental accepted in the
-- tiny window after this commits leaves the account suspended WITH a
-- live contract — which the RESTRICT FKs still make impossible to
-- hard-delete, and which back-office review catches during the grace
-- window.
--
-- ROLLBACK: re-apply the 20260502122000 bodies of
-- request_account_deletion()/cancel_account_deletion() (drops the
-- P013x guards). The column/index are shared with 122000 and need no
-- rollback.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Column + partial index (from 122000; no-ops where they exist)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create index if not exists profiles_deletion_requested_idx
  on public.profiles(deletion_requested_at)
  where deletion_requested_at is not null;

-- ---------------------------------------------------------------------
-- (2) request_account_deletion — soft delete + suspend, now guarded
-- ---------------------------------------------------------------------
-- Idempotent for the caller: a repeat call on an already-pending
-- profile keeps the ORIGINAL timestamp (grace deadline never slides).
-- Customers only — merchants/admins offboard via back office (P0072).
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

  -- Lock the caller's row: blocker checks + stamp are atomic, and
  -- concurrent request/cancel calls serialize instead of interleaving.
  select role into v_role
    from profiles
   where id = v_uid
     for update;

  if v_role is null then
    raise exception 'Profile not found' using errcode = 'P0071';
  end if;

  if v_role <> 'customer' then
    raise exception 'Self-serve deletion is for customer accounts only'
      using errcode = 'P0072';
  end if;

  -- ------- business-rule guards (server-side source of truth) -------

  -- Active rental (overdue rentals are still status 'active').
  if exists (
    select 1 from rental_contracts
     where customer_user_id = v_uid and status = 'active'
  ) then
    raise exception 'Account has an active rental contract'
      using errcode = 'P0130';
  end if;

  -- Accepted contract not yet activated (receipt-photo step pending).
  if exists (
    select 1 from rental_contracts
     where customer_user_id = v_uid and status = 'pending'
  ) then
    raise exception 'Account has a rental contract awaiting activation'
      using errcode = 'P0131';
  end if;

  -- Open / escalated damage or non-return case.
  if exists (
    select 1 from damage_cases
     where customer_user_id = v_uid and status in ('open', 'escalated')
  ) then
    raise exception 'Account has an open damage case'
      using errcode = 'P0132';
  end if;

  -- Unsettled signed financial obligation.
  if exists (
    select 1 from promissory_notes
     where customer_user_id = v_uid and status in ('signed', 'defaulted')
  ) then
    raise exception 'Account has an unsettled financial obligation'
      using errcode = 'P0133';
  end if;

  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now()),
         account_status        = 'suspended',
         updated_at            = now()
   where id = v_uid;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'Soft-delete request (App Store 5.1.1(v)): stamps deletion_requested_at + suspends the CUSTOMER caller. Blocks when operationally active or financially unresolved: P0130 active contract, P0131 pending contract, P0132 open damage case, P0133 unsettled note. P0070/71/72 auth guards. Hard removal is back-office after the grace window; RESTRICT FKs preserve legal records regardless.';

-- ---------------------------------------------------------------------
-- (3) cancel_account_deletion — undo during the grace window
-- ---------------------------------------------------------------------
-- Unchanged semantics from 122000; re-created so a production DB that
-- never received 122000 gets it too. The deletion_requested_at guard
-- means an ADMIN-suspended account (no pending request) cannot use
-- this to self-reactivate.
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

comment on function public.cancel_account_deletion() is
  'Reverts a pending self-serve deletion request during the grace window (customer scope via auth.uid(); no-op unless a request is on file).';

-- PostgREST discovers new functions via its schema cache; Supabase
-- refreshes it automatically on DDL (NOTIFY pgrst). Nothing to do
-- manually, but if PGRST202 persists after applying, reload the
-- schema cache from the dashboard (Settings → API → Reload schema).
notify pgrst, 'reload schema';
