-- =====================================================================
-- Merchant fills a missing customer National ID
-- =====================================================================
-- Signup already captures National ID (commit 4c1c639 + trigger
-- 20260502121900). But if a legacy customer has profiles.national_id
-- NULL, the merchant rental session gets stuck: confirm_renter_presence
-- requires national_id to be non-null. This migration lets the
-- merchant fill it in ONCE for the customer they've just looked up,
-- with the same Saudi format validation the customer signup uses.
--
-- What this migration adds:
--   (1) Extends lookup_renter_by_mobile to also return
--       has_national_id (boolean). Existing consumers that read
--       {id, has_nafath} still work — the extra column is ignored.
--       The merchant session UI reads has_national_id to decide
--       whether to prompt for the missing id before calling
--       confirm_renter_presence.
--   (2) merchant_set_customer_national_id(p_customer_id, p_mobile,
--       p_national_id) SECURITY DEFINER RPC. Guards (all enforced
--       inside the RPC — the UI is never the sole gate):
--         * caller is an active merchant owner OR an admin
--         * mobile canonicalises to Saudi format
--         * national_id matches ^[12][0-9]{9}$ after digit-only strip
--         * target profile's role = 'customer'
--         * target profile's mobile = canonical(p_mobile)
--         * target profile's national_id IS NULL or empty
--       Never overwrites; treats "already set" as a silent no-op.
--       No side effects on eligibility, invoices, contracts,
--       payments, Nafath/Nafith, or promissory notes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Extend lookup_renter_by_mobile with has_national_id
-- ---------------------------------------------------------------------
create or replace function public.lookup_renter_by_mobile(p_mobile text)
returns table (
  id               uuid,
  has_nafath       boolean,
  has_national_id  boolean
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
  select p.id,
         (p.nafath_verified_at is not null) as has_nafath,
         (p.national_id is not null and length(p.national_id) > 0) as has_national_id
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
   limit 1;
end;
$$;

grant execute on function public.lookup_renter_by_mobile(text) to authenticated;

-- ---------------------------------------------------------------------
-- (2) merchant_set_customer_national_id
-- ---------------------------------------------------------------------
create or replace function public.merchant_set_customer_national_id(
  p_customer_id  uuid,
  p_mobile       text,
  p_national_id  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical_mobile text;
  v_normalised_id    text;
  v_current          text;
  v_role             app_role;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0080';
  end if;

  -- Caller must be an active merchant owner or an admin. `is_admin()`
  -- exists from earlier migrations; the merchant check reads the
  -- merchants row directly (same predicate close_rental_contract uses).
  if not (
    public.is_admin()
    or exists (
      select 1 from public.merchants m
      where m.owner_user_id = auth.uid() and m.status = 'active'
    )
  ) then
    raise exception 'Not authorised' using errcode = 'P0081';
  end if;

  -- Canonicalise mobile (same helper the signup + verify flow use).
  v_canonical_mobile := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical_mobile is null then
    raise exception 'Invalid mobile format' using errcode = 'P0083';
  end if;

  -- Strip non-digits so accidental whitespace / separators don't
  -- cause false negatives, then validate Saudi format.
  v_normalised_id := regexp_replace(coalesce(p_national_id, ''), '\D', '', 'g');
  if v_normalised_id !~ '^[12][0-9]{9}$' then
    raise exception 'Invalid National ID format' using errcode = 'P0082';
  end if;

  -- Verify the target profile exists, is a customer, matches the
  -- canonical mobile, and currently has no national_id. Any mismatch
  -- raises — the client must not retry silently.
  select national_id, role
    into v_current, v_role
  from public.profiles
  where id = p_customer_id
    and mobile = v_canonical_mobile;

  if not found then
    raise exception 'Customer not found or mobile mismatch' using errcode = 'P0084';
  end if;

  if v_role <> 'customer' then
    raise exception 'Target profile is not a customer' using errcode = 'P0085';
  end if;

  -- Idempotent: if already set, treat as a silent success. Never
  -- overwrite an existing value.
  if v_current is not null and length(v_current) > 0 then
    return;
  end if;

  update public.profiles
     set national_id = v_normalised_id,
         updated_at  = now()
   where id = p_customer_id
     and role = 'customer'
     and mobile = v_canonical_mobile
     and (national_id is null or national_id = '');
end;
$$;

grant execute on function public.merchant_set_customer_national_id(uuid, text, text) to authenticated;
