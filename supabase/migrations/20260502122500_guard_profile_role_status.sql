-- =====================================================================
-- Auth Hardening Phase 1 — prevent role / account_status self-escalation
--
-- Problem: `profiles_self_update` RLS (rls_policies.sql) allows a user
-- to UPDATE any column of their own row, including `role` and
-- `account_status`. A customer could therefore self-promote to
-- 'merchant' (skipping the application/approval pipeline) or 'admin'
-- (is_admin() reads profiles.role, so this grants full admin RLS
-- powers) with a single direct PostgREST call.
--
-- Fix: a BEFORE UPDATE trigger that rejects changes to the two
-- privileged columns unless the update comes from a privileged
-- context. The RLS policy itself is intentionally left unchanged —
-- benign self-service updates (mobile, city, national_id backfill,
-- full_name) keep working exactly as before.
--
-- Privileged contexts that MUST keep working (writer audit):
--   * provision_merchant_from_application — admin-gated (P0010), runs
--     under an admin JWT → passes the is_admin() branch, and as a
--     SECURITY DEFINER function also passes the current_user branch.
--   * request_account_deletion / cancel_account_deletion — SECURITY
--     DEFINER, called by the CUSTOMER (not an admin) to flip their own
--     account_status. Definer functions execute as their owner (a
--     superuser/service role, never `authenticated`), so the
--     current_user branch lets them through.
--   * Admin console (AdminUserDetails) — direct PostgREST update under
--     an admin JWT → is_admin() branch.
--   * Dashboard SQL / service_role / migrations — current_user is not
--     `authenticated`/`anon` → allowed.
--   * handle_new_auth_user — INSERT, not UPDATE; unaffected.
--
-- How the check works:
--   current_user inside a (SECURITY INVOKER) trigger function is the
--   role PostgREST executes as: `authenticated` (or `anon`) for direct
--   REST writes, but the FUNCTION OWNER inside SECURITY DEFINER RPCs.
--   So "current_user in (anon, authenticated) AND caller is not an
--   admin" precisely identifies an end-user REST write and nothing
--   else. The trigger function is deliberately NOT security definer.
--
-- Errcode: P0100 — mapped to the generic "not allowed" copy client-
-- side; no client flow performs this write, so users never see it.
-- =====================================================================

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER (default) on purpose — see header comment.
set search_path = public
as $$
begin
  -- Only privileged columns are guarded; everything else passes.
  if new.role is distinct from old.role
     or new.account_status is distinct from old.account_status then
    if current_user in ('anon', 'authenticated') and not public.is_admin() then
      raise exception
        'changing role or account_status is not allowed'
        using errcode = 'P0100';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;

-- WHEN clause keeps the trigger off the hot path for ordinary profile
-- updates — it only fires when a privileged column actually changes.
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row
  when (
    old.role is distinct from new.role
    or old.account_status is distinct from new.account_status
  )
  execute function public.guard_profile_privileged_columns();

comment on function public.guard_profile_privileged_columns() is
  'Auth Hardening Phase 1: blocks end-user REST updates to profiles.role / profiles.account_status (errcode P0100). Admin JWTs and SECURITY DEFINER RPCs pass.';
