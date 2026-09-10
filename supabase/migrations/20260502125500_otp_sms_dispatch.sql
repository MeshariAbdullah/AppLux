-- =====================================================================
-- SMS dispatch support for the renter-OTP flow (MSEGAT send-only)
-- =====================================================================
-- The customer-presence OTP (20260502125100) keeps its ENTIRE
-- verification model unchanged: DB-generated code, sha256 code_hash
-- verification via merchant_verify_renter_otp, 10-minute expiry,
-- 5-attempt cap, supersession, and the P0195 offer-issuance gate that
-- consumes verified challenges. This migration adds ONLY the delivery
-- seam: a service-role-only function the otp-send Edge Function calls
-- to fetch the plaintext code ONCE for handing to the SMS provider.
--
-- Security model:
--   * The plaintext lives in the existing TEMPORARY code_inapp column
--     (no new plaintext storage). In-app delivery (get_my_renter_otp)
--     keeps working for environments still on the rpc-inapp provider.
--   * get_renter_otp_for_dispatch is EXECUTABLE ONLY by service_role
--     (the Edge Function). It is revoked from public/anon/
--     authenticated AND double-guarded in the body, so no browser
--     session — merchant or customer — can ever read another party's
--     code through it.
--   * A challenge can be fetched for dispatch at most ONCE
--     (sms_dispatched_at stamp); a resend goes through
--     merchant_start_renter_otp again (new code, old one superseded).
--
-- Idempotent. Additive only — no applied migration is modified.
-- =====================================================================

alter table public.renter_otp_challenges
  add column if not exists sms_dispatched_at timestamptz;

comment on column public.renter_otp_challenges.sms_dispatched_at is
  'When the plaintext code was handed to the SMS provider by the otp-send Edge Function (one-time fetch). NULL for in-app-delivered challenges.';

create or replace function public.get_renter_otp_for_dispatch(
  p_mobile     text,
  p_created_by uuid
)
returns table (
  challenge_id uuid,
  code         text,
  mobile       text,
  expires_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
begin
  -- Service-role only. PostgREST maps end-user JWTs to the anon /
  -- authenticated roles — refuse them outright even though EXECUTE is
  -- also revoked below (defense in depth).
  if current_user in ('anon', 'authenticated') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  -- The newest live, still-undelivered challenge this merchant opened
  -- for this mobile. Stamping sms_dispatched_at makes the fetch
  -- single-use: a second call returns nothing.
  return query
  update public.renter_otp_challenges c
     set sms_dispatched_at = now()
   where c.id = (
     select c2.id
       from public.renter_otp_challenges c2
      where c2.created_by = p_created_by
        and c2.mobile = v_canonical
        and c2.verified_at is null
        and c2.superseded_at is null
        and c2.used_at is null
        and c2.sms_dispatched_at is null
        and c2.expires_at > now()
      order by c2.created_at desc
      limit 1
   )
   returning c.id, c.code_inapp, c.mobile, c.expires_at;
end;
$$;

revoke all on function public.get_renter_otp_for_dispatch(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_renter_otp_for_dispatch(text, uuid)
  to service_role;

comment on function public.get_renter_otp_for_dispatch(text, uuid) is
  'SERVICE-ROLE ONLY (otp-send Edge Function): one-time fetch of the plaintext renter-OTP code for SMS dispatch. Never callable by browser sessions; verification remains exclusively merchant_verify_renter_otp (code_hash).';

notify pgrst, 'reload schema';
