-- =====================================================================
-- Unified Number (700) availability check — surface a duplicate at Step 2
-- of onboarding instead of at final submit.
--
-- The onboarding wizard is anonymous and merchant_applications /
-- merchants are RLS-protected, so a client SELECT can't see a pending
-- application's conflict. This SECURITY DEFINER function is the safe,
-- server-authoritative check: it returns ONLY a neutral boolean and
-- never any merchant/application detail.
--
-- Blocking matrix (mirrors the DB unique backstop from 20260502123900):
--   * merchants           — ANY row (pending_review/active/suspended)
--   * merchant_applications — status in ('pending','approved')
--   * rejected applications DO NOT block (the number is freed, exactly
--     like the pending-scoped unique index allows re-submission)
--
-- The DB unique indexes remain the final authority; this only improves
-- the UX. Enumeration risk is low (establishment numbers are public
-- business identifiers and the reply is a bare boolean), and malformed
-- input returns false without touching any table.
--
-- ROLLBACK: drop function public.check_unified_number_available(text);
-- NOT auto-applied.
-- =====================================================================

create or replace function public.check_unified_number_available(p_unified text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num text;
begin
  v_num := regexp_replace(coalesce(p_unified, ''), '\D', '', 'g');
  -- Malformed → "not available" without probing any table (the client
  -- validates the 700+7-digit format first; this is a safe guard).
  if v_num !~ '^700[0-9]{7}$' then
    return false;
  end if;

  if exists (
    select 1 from public.merchants where unified_number = v_num
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.merchant_applications
    where unified_number = v_num and status in ('pending', 'approved')
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.check_unified_number_available(text) from public;
grant execute on function public.check_unified_number_available(text) to anon, authenticated;

comment on function public.check_unified_number_available(text) is
  'Neutral availability check for the establishment Unified Number (700). Returns false when taken by any merchant or a pending/approved application, or when malformed. SECURITY DEFINER; leaks no merchant/application detail. The unique indexes remain the final authority.';
