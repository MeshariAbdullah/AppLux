-- =====================================================================
-- AppLux MVP — Phase 7d harden renter-presence against duplicates
-- =====================================================================
-- Replaces public.confirm_renter_presence with a duplicate-safe
-- version: it returns zero rows when (canonical mobile + last 4 of
-- national_id) matches more than one customer profile, instead of
-- arbitrarily picking one via LIMIT 1. The original behaviour was a
-- privacy hazard — a merchant could be routed to the wrong renter's
-- name and city if the data contained accidental duplicates.
--
-- Idempotent: `create or replace`. Bodies that already exist are
-- left intact for canonicalize_saudi_mobile and lookup_renter_by_mobile.
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
  v_match_count int;
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

  v_last4 := regexp_replace(coalesce(p_id_last4, ''), '\D', '', 'g');
  if v_last4 !~ '^[0-9]{4}$' then
    return;
  end if;

  -- Reject ambiguous matches. Privacy hazard: never silently pick one
  -- of N customers when their (mobile, last4) collide. The admin
  -- must resolve the duplicate at the data layer before the flow
  -- can complete.
  select count(*) into v_match_count
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
     and p.national_id is not null
     and right(p.national_id, 4) = v_last4;

  if v_match_count <> 1 then
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
     and right(p.national_id, 4) = v_last4;
end;
$$;

grant execute on function public.confirm_renter_presence(text, text) to authenticated;
