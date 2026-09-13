-- =====================================================================
-- Read-only renter-verification status — safe wizard-draft restore
-- =====================================================================
-- The merchant rental-session wizard now persists an in-progress
-- draft locally. A restored draft must NEVER trust "customer was
-- verified" from device storage: the server is the only authority.
-- Direct reads of renter_otp_challenges are revoked (20260502125100),
-- so this adds the one read-only surface the restore needs:
--
--   merchant_renter_verification_status(p_mobile)
--     → the SAME renter payload merchant_verify_renter_otp returns,
--       but ONLY when a challenge verified by THIS merchant for THIS
--       customer is still issuable under the EXACT P0195 predicate
--       (verified_at within 30 minutes, not yet spent). Otherwise
--       zero rows. Nothing is created, consumed, or superseded — a
--       pure read, so calling it cannot affect the OTP flow.
--
-- PII posture: renter details are returned only in the verified case
-- — the same moment the merchant already saw them via the verify RPC.
-- Unverified/unknown mobiles return zero rows (no new existence
-- oracle: lookup_renter_by_mobile already answers existence).
--
-- Idempotent. ROLLBACK: drop function
-- public.merchant_renter_verification_status(text).
-- =====================================================================

create or replace function public.merchant_renter_verification_status(p_mobile text)
returns table (
  id           uuid,
  full_name    text,
  mobile       text,
  city         text,
  has_nafath   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      app_role;
  v_canonical text;
  v_customer  uuid;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can check renter verification' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  select profiles.id into v_customer
    from public.profiles
   where profiles.mobile = v_canonical and profiles.role = 'customer';
  if v_customer is null then
    return;                      -- zero rows: nothing to restore
  end if;

  -- EXACTLY the P0195 issuance predicate (enforce_renter_otp_on_
  -- invoice): a challenge this merchant verified for this customer,
  -- inside the 30-minute window, not yet spent on an invoice.
  if not exists (
    select 1 from public.renter_otp_challenges c
     where c.created_by = auth.uid()
       and c.customer_user_id = v_customer
       and c.verified_at is not null
       and c.verified_at > now() - interval '30 minutes'
       and c.used_invoice_id is null
  ) then
    return;                      -- zero rows: re-verification required
  end if;

  return query
  select p.id,
         p.full_name,
         p.mobile,
         p.city,
         (p.nafath_verified_at is not null) as has_nafath
    from public.profiles p
   where p.id = v_customer;
end;
$$;

grant execute on function public.merchant_renter_verification_status(text) to authenticated;

comment on function public.merchant_renter_verification_status(text) is
  'Read-only: returns the verified renter payload iff a challenge verified by the calling merchant for this mobile''s customer is still issuable under the exact P0195 predicate (verified within 30 minutes, unspent). Zero rows otherwise. Used to safely restore the rental-session wizard draft — device storage is never trusted for verification state.';

notify pgrst, 'reload schema';
