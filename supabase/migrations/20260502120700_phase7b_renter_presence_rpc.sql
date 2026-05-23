-- =====================================================================
-- AppLux MVP — Phase 7b interim renter-presence check
-- =====================================================================
-- A production-safe interim verification step that lets the merchant
-- flow run *without* deploying the otp-send / otp-verify edge functions
-- yet. Real Twilio OTP remains the target end state; this RPC bridges
-- the gap so the live backend is testable today.
--
-- The merchant authenticates as themselves, looks up a renter by mobile
-- (existence-only via lookup_renter_by_mobile), then asks the renter
-- for the last 4 digits of their National ID — which the merchant has
-- in hand anyway as part of any KYC-driven rental. The combined match
-- (canonical mobile + last 4 of national_id, both stored server-side)
-- is verified by this SECURITY DEFINER RPC, which then returns the
-- renter's safe profile fields exactly like otp-verify would.
--
-- Security boundary:
--   * Caller must be authenticated AND have role merchant or admin.
--   * The renter must already exist with a non-null mobile + national_id
--     that match what the merchant typed.
--   * Mobile is canonicalized server-side via canonicalize_saudi_mobile.
--   * National ID is compared against the LAST 4 digits only — we never
--     accept or echo back the full ID through this surface.
--   * Function returns at most one row; never enumerates customers.
-- =====================================================================

create or replace function public.confirm_renter_presence(
  p_mobile   text,
  p_id_last4 text
)
returns table (
  id           uuid,
  full_name    text,
  mobile       text,
  city         text,
  has_nafath   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role        app_role;
  v_canonical   text;
  v_last4       text;
begin
  -- Caller authorisation — merchants and admins only.
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can confirm renter presence' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  -- Normalise the supplied "last 4" — strip everything that isn't a
  -- digit, then accept only an exact 4-digit string. Anything else
  -- returns an empty result, same as a non-match.
  v_last4 := regexp_replace(coalesce(p_id_last4, ''), '\D', '', 'g');
  if v_last4 !~ '^[0-9]{4}$' then
    return;
  end if;

  return query
  select p.id,
         p.full_name,
         p.mobile,
         p.city,
         (p.nafath_verified_at is not null)
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
     and p.national_id is not null
     and right(p.national_id, 4) = v_last4
   limit 1;
end;
$$;

grant execute on function public.confirm_renter_presence(text, text) to authenticated;
