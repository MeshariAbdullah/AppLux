-- =====================================================================
-- AppLux MVP — Phase 7 real-OTP prerequisites
-- =====================================================================
-- Five changes for the merchant-led rental session to operate against
-- real renter accounts in production:
--
--   * canonicalize_saudi_mobile(raw text) — SQL helper that maps any
--     accepted input shape to the single canonical 9-digit form
--     `5XXXXXXXX`. Used by the auth trigger AND by callers (no raw
--     mobile string ever lands on `profiles.mobile`).
--
--   * profiles.mobile CHECK constraint — rejects anything that isn't
--     either NULL or the canonical `5\d{8}` shape. The DB is the
--     source of truth for the lookup format.
--
--   * profiles.mobile gets an index — lookups + the OTP edge function
--     both filter on this column on the hot path.
--
--   * handle_new_auth_user now persists `mobile` from auth metadata
--     through canonicalize_saudi_mobile, so the new "Mobile number"
--     field on SupabaseRegister always lands canonically.
--
--   * lookup_renter_by_mobile(p_mobile text) — security definer RPC
--     that returns ONLY non-sensitive fields (id, has_nafath) of the
--     renter with that canonical mobile. Used by the merchant for the
--     pre-OTP existence check. The renter's name/city are NOT exposed
--     here — those only surface after OTP verification (which goes
--     through the otp-verify edge function with the service role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Canonicalizer
-- ---------------------------------------------------------------------
-- Accepts:  5XXXXXXXX, 05XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX,
--           009665XXXXXXXX, with any whitespace/dashes mixed in.
-- Returns:  5XXXXXXXX  (9 digits, starts with 5) — or NULL if invalid.

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
-- One-time backfill so any pre-existing non-canonical values can satisfy
-- the new CHECK constraint. Idempotent.
-- ---------------------------------------------------------------------

update public.profiles
   set mobile = public.canonicalize_saudi_mobile(mobile)
 where mobile is not null
   and mobile !~ '^5[0-9]{8}$';

-- ---------------------------------------------------------------------
-- Constraint + index
-- ---------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_mobile_canonical;
alter table public.profiles
  add constraint profiles_mobile_canonical
  check (mobile is null or mobile ~ '^5[0-9]{8}$');

create index if not exists profiles_mobile_idx on public.profiles(mobile);

-- ---------------------------------------------------------------------
-- Trigger — canonicalize on signup
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
-- Renter lookup RPC — minimal-disclosure pre-OTP existence check.
-- ---------------------------------------------------------------------
-- Returns only: id + has_nafath. Name, city, and any other identifying
-- fields stay hidden until the merchant completes OTP verification via
-- the otp-verify edge function (which uses the service role to fetch
-- the renter's profile fields and only returns them after Twilio
-- approves the code).

create or replace function public.lookup_renter_by_mobile(p_mobile text)
returns table (
  id          uuid,
  has_nafath  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role app_role;
  v_canonical text;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can look up renters' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  return query
  select p.id, (p.nafath_verified_at is not null)
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
   limit 1;
end;
$$;

grant execute on function public.lookup_renter_by_mobile(text) to authenticated;
