-- =====================================================================
-- Separate merchant registration — M1 (2/2): active-merchant guard on
-- role-keyed merchant RPCs + the dual-generation approval RPC.
--
-- New model: merchant accounts exist BEFORE approval (role='merchant',
-- account_status='pending', no merchants row). Server-side operational
-- access must therefore key on "has an ACTIVE merchants row", never on
-- role alone.
--
-- Audit of merchant operational paths:
--   * Row-keyed (inherently blocked pre-approval — the merchants row
--     does not exist, so is_merchant_owner()/ownership predicates are
--     false): rental_invoices insert/update RLS, invoice items,
--     close_rental_contract (owner path), damage_cases insert RLS,
--     damage evidence, contracts reads.
--   * Role-keyed (accepted ANY role='merchant' — must gain the guard):
--     lookup_renter_by_mobile, confirm_renter_presence,
--     get_renter_eligibility. (merchant_set_customer_national_id
--     already requires an active merchants row — P0081.)
--
-- Errcode: P0110 "merchant account is not active" — pending, rejected,
-- and (future phase) suspended merchants all fail this guard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_active_merchant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.merchants m
    where m.owner_user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.assert_merchant_active()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return;
  end if;
  if not public.is_active_merchant() then
    raise exception 'Merchant account is not active'
      using errcode = 'P0110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- lookup_renter_by_mobile — body unchanged except the added guard.
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
  -- M1: role alone is no longer enough — pending/rejected merchant
  -- accounts must not identify renters.
  perform public.assert_merchant_active();

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
-- confirm_renter_presence — body unchanged except the added guard.
-- ---------------------------------------------------------------------
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
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can confirm renter presence' using errcode = 'P0030';
  end if;
  perform public.assert_merchant_active();

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  v_last4 := regexp_replace(coalesce(p_id_last4, ''), '\D', '', 'g');
  if v_last4 !~ '^[0-9]{4}$' then
    return;
  end if;

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

-- ---------------------------------------------------------------------
-- get_renter_eligibility — body unchanged except the added guard.
-- ---------------------------------------------------------------------
create or replace function public.get_renter_eligibility(p_renter_id uuid)
returns table (
  user_id      uuid,
  limit_amount numeric,
  used_amount  numeric,
  tier         public.eligibility_tier
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can read renter eligibility' using errcode = 'P0030';
  end if;
  perform public.assert_merchant_active();

  return query
  select e.user_id, e.limit_amount, e.used_amount, e.tier
    from public.rental_eligibility e
   where e.user_id = p_renter_id;
end;
$$;

grant execute on function public.get_renter_eligibility(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- approve_merchant_application — dual-generation, idempotent approval.
--
--   * Legacy applicants (role='customer', pre-separation queue): lifts
--     role → 'merchant' exactly like provision_merchant_from_application.
--   * New applicants (role='merchant', account_status='pending'): role
--     already correct; activation only.
--   * Creates or reuses the merchants row (unique application_id).
--   * Stores the APPLICANT-SELECTED category (never a hardcoded value).
--   * Copies application branches → merchant_branches exactly once
--     (skipped when the merchant already has branches, so retries and
--     legacy applications without draft branches are both safe).
--   * Flips profiles.account_status → 'active' (allowed through the
--     P0100 guard: admin JWT and/or SECURITY DEFINER owner).
--
-- Errcodes reuse the provisioning family: P0010 not admin, P0011 not
-- found, P0012 not approved. Supersedes
-- provision_merchant_from_application (kept for compatibility).
-- ---------------------------------------------------------------------
create or replace function public.approve_merchant_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app         public.merchant_applications%rowtype;
  v_merchant_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve merchant applications' using errcode = 'P0010';
  end if;

  select * into v_app from public.merchant_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found' using errcode = 'P0011';
  end if;
  if v_app.status <> 'approved' then
    raise exception 'Application is not approved' using errcode = 'P0012';
  end if;

  -- Create or reuse the merchants row (idempotent via unique application_id).
  select m.id into v_merchant_id
    from public.merchants m
   where m.application_id = p_application_id;

  if v_merchant_id is null then
    insert into public.merchants (
      owner_user_id, application_id, company_name, commercial_reg_number,
      display_name, primary_category, city, status, verified,
      approved_at, approved_by
    ) values (
      v_app.applicant_user_id,
      v_app.id,
      v_app.company_name,
      v_app.commercial_reg_number,
      jsonb_build_object('ar', v_app.company_name, 'en', v_app.company_name),
      v_app.primary_category,
      v_app.city,
      'active',
      false,
      now(),
      auth.uid()
    )
    returning id into v_merchant_id;
  end if;

  -- Copy draft branches exactly once. Legacy applications have no
  -- draft rows (the old flow never collected branches) — no-op there.
  if not exists (
    select 1 from public.merchant_branches b where b.merchant_id = v_merchant_id
  ) then
    insert into public.merchant_branches (
      merchant_id, name, city, address, phone, is_primary
    )
    select
      v_merchant_id,
      jsonb_build_object('ar', ab.name, 'en', ab.name),
      ab.city,
      jsonb_build_object('ar', ab.address, 'en', ab.address),
      ab.phone,
      (ab.position = 0)
    from public.merchant_application_branches ab
    where ab.application_id = p_application_id
    order by ab.position;
  end if;

  -- Activate the account. Legacy customers are lifted to merchant;
  -- new-generation applicants already carry the role. Admin profiles
  -- are never demoted.
  update public.profiles
     set role = 'merchant',
         account_status = 'active',
         updated_at = now()
   where id = v_app.applicant_user_id
     and role <> 'admin';

  return v_merchant_id;
end;
$$;

grant execute on function public.approve_merchant_application(uuid) to authenticated;

comment on function public.approve_merchant_application(uuid) is
  'Separate-merchant-registration M1: idempotent admin approval — creates/reuses the merchants row, copies draft branches once, activates the account. Handles legacy customer applicants and new merchant/pending applicants.';
