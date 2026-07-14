-- =====================================================================
-- Separate merchant registration — M2: account-type-aware signup
-- trigger with metadata safety.
--
-- Merchant signup sends ONE auth.signUp call with metadata:
--   { account_type: 'merchant',
--     full_name: <authorized rep name>,
--     merchant_application: {
--       company_name, commercial_reg_number, authorized_name,
--       authorized_national_id, category, contact_mobile,
--       contact_email?, branches: [{name, city, address, phone?}, ...]
--     } }
--
-- METADATA SAFETY (approved security adjustment): the application
-- payload — rep National ID, CR, contacts, branch addresses — must not
-- remain in auth.users.raw_user_meta_data. Approach:
--
--   1. BEFORE INSERT trigger: copies the payload into a
--      TRANSACTION-LOCAL GUC (set_config(..., true)) and replaces
--      NEW.raw_user_meta_data with the minimal safe subset
--      { account_type, full_name }. The sensitive payload is therefore
--      NEVER PERSISTED in the auth schema — this shapes GoTrue's own
--      INSERT (standard Postgres), it does not UPDATE auth rows, add
--      recursion, or touch anything GoTrue reads back structurally.
--   2. AFTER INSERT trigger (handle_new_auth_user v3): reads the GUC,
--      validates, and writes profiles + merchant_applications +
--      merchant_application_branches in the SAME transaction as the
--      auth insert — fully atomic; any validation failure aborts the
--      entire signup (no orphaned auth user, no partial rows).
--
-- PRIVILEGE SAFETY: only the exact string 'merchant' selects the
-- merchant branch. Any other account_type — including 'admin' — falls
-- through to the customer branch (today's exact behavior, which grants
-- nothing). role/account_status remain unwritable to end users (P0100).
--
-- Customer signup metadata is intentionally UNCHANGED in this phase
-- (full_name/mobile/national_id — its cleanup is the separate,
-- not-yet-approved National-ID proposal).
--
-- Errcode P0120: invalid merchant signup payload.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BEFORE INSERT — stash payload, strip metadata to the safe minimum.
-- ---------------------------------------------------------------------
create or replace function public.stash_merchant_signup_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'account_type' = 'merchant' then
    perform set_config(
      'lend.merchant_signup_payload',
      coalesce(new.raw_user_meta_data->'merchant_application', 'null'::jsonb)::text,
      true  -- transaction-local: gone at commit/rollback
    );
    new.raw_user_meta_data := jsonb_build_object(
      'account_type', 'merchant',
      'full_name', coalesce(new.raw_user_meta_data->>'full_name', new.email)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_stash on auth.users;
create trigger on_auth_user_created_stash
  before insert on auth.users
  for each row execute function public.stash_merchant_signup_payload();

-- ---------------------------------------------------------------------
-- AFTER INSERT — branch by account type.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload     jsonb;
  v_branches    jsonb;
  v_branch      jsonb;
  v_cr          text;
  v_rep_id      text;
  v_mobile      text;
  v_category    public.rental_category;
  v_app_id      uuid;
  v_pos         int := 0;
begin
  if new.raw_user_meta_data->>'account_type' = 'merchant' then
    -- ============ MERCHANT SIGNUP ============
    v_payload := nullif(current_setting('lend.merchant_signup_payload', true), '')::jsonb;
    if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
      raise exception 'Merchant signup payload missing' using errcode = 'P0120';
    end if;

    if coalesce(trim(v_payload->>'company_name'), '') = '' then
      raise exception 'Merchant signup: company name required' using errcode = 'P0120';
    end if;
    if coalesce(trim(v_payload->>'authorized_name'), '') = '' then
      raise exception 'Merchant signup: authorized name required' using errcode = 'P0120';
    end if;

    v_cr := regexp_replace(coalesce(v_payload->>'commercial_reg_number', ''), '\D', '', 'g');
    if v_cr !~ '^[0-9]{10}$' then
      raise exception 'Merchant signup: invalid commercial registration number' using errcode = 'P0120';
    end if;

    v_rep_id := regexp_replace(coalesce(v_payload->>'authorized_national_id', ''), '\D', '', 'g');
    if v_rep_id !~ '^[12][0-9]{9}$' then
      raise exception 'Merchant signup: invalid representative national id' using errcode = 'P0120';
    end if;

    v_mobile := public.canonicalize_saudi_mobile(v_payload->>'contact_mobile');
    if v_mobile is null then
      raise exception 'Merchant signup: invalid contact mobile' using errcode = 'P0120';
    end if;

    begin
      v_category := (v_payload->>'category')::public.rental_category;
    exception when others then
      raise exception 'Merchant signup: invalid category' using errcode = 'P0120';
    end;

    v_branches := v_payload->'branches';
    if v_branches is null
       or jsonb_typeof(v_branches) <> 'array'
       or jsonb_array_length(v_branches) < 1 then
      raise exception 'Merchant signup: at least one branch required' using errcode = 'P0120';
    end if;

    -- Profile: born merchant/pending. NO eligibility row — merchants
    -- never receive rental credit. Rep national id lives on the
    -- profile (RLS-protected), NOT in auth metadata.
    insert into public.profiles (id, full_name, email, mobile, national_id, city, role, account_status)
    values (
      new.id,
      coalesce(trim(v_payload->>'authorized_name'), new.email),
      new.email,
      null,           -- merchant contact mobile lives on the application
      v_rep_id,
      v_branches->0->>'city',
      'merchant',
      'pending'
    )
    on conflict (id) do nothing;

    insert into public.merchant_applications (
      applicant_user_id, company_name, commercial_reg_number,
      authorized_name, authorized_national_id, city, primary_category,
      contact_email, contact_phone, status
    ) values (
      new.id,
      trim(v_payload->>'company_name'),
      v_cr,
      trim(v_payload->>'authorized_name'),
      v_rep_id,
      coalesce(nullif(trim(v_branches->0->>'city'), ''), 'riyadh'),
      v_category,
      coalesce(nullif(trim(v_payload->>'contact_email'), ''), new.email),
      v_mobile,
      'pending'
    )
    returning id into v_app_id;

    for v_branch in select * from jsonb_array_elements(v_branches) loop
      if coalesce(trim(v_branch->>'name'), '') = ''
         or coalesce(trim(v_branch->>'city'), '') = ''
         or coalesce(trim(v_branch->>'address'), '') = '' then
        raise exception 'Merchant signup: branch name/city/address required' using errcode = 'P0120';
      end if;
      insert into public.merchant_application_branches
        (application_id, name, city, address, phone, position)
      values (
        v_app_id,
        trim(v_branch->>'name'),
        trim(v_branch->>'city'),
        trim(v_branch->>'address'),
        nullif(trim(coalesce(v_branch->>'phone', '')), ''),
        v_pos
      );
      v_pos := v_pos + 1;
    end loop;

  else
    -- ============ CUSTOMER SIGNUP (unchanged behavior) ============
    insert into public.profiles (id, full_name, email, mobile, national_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.email,
      public.canonicalize_saudi_mobile(new.raw_user_meta_data->>'mobile'),
      nullif(new.raw_user_meta_data->>'national_id', '')
    )
    on conflict (id) do nothing;

    insert into public.rental_eligibility (user_id, limit_amount, used_amount, tier)
    values (new.id, 100000, 0, 'standard')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Signup trigger v3 (merchant separation M2): account_type=merchant → merchant/pending profile + application + draft branches, no eligibility, payload from a transaction-local GUC (never persisted in auth metadata). Everything else → the unchanged customer branch.';
comment on function public.stash_merchant_signup_payload() is
  'Merchant separation M2: BEFORE INSERT on auth.users — stashes the merchant application payload into a transaction-local GUC and strips auth metadata to {account_type, full_name} so sensitive business/ID data is never persisted in the auth schema.';
