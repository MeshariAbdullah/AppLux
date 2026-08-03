-- =====================================================================
-- pgcrypto digest() schema-qualification fix.
--
-- ROOT CAUSE: three SECURITY DEFINER functions call `digest(text,
-- 'sha256')` UNQUALIFIED while pinned to `set search_path = public`. On
-- Supabase, pgcrypto is installed in the `extensions` schema, which the
-- restricted search_path excludes — so `digest` cannot be resolved and
-- signup fails with:
--     ERROR: function digest(text, unknown) does not exist  (42883)
-- (next_contract_number's gen_random_bytes is unaffected: it is NOT
-- SECURITY DEFINER and inherits the session search_path that includes
-- extensions.)
--
-- FIX: schema-qualify every hash call as
--     encode(extensions.digest(convert_to(<text>, 'UTF8'), 'sha256'), 'hex')
-- The value is byte-for-byte identical to the previous `digest(text,…)`
-- for ASCII base64url receipts, so merchant_upload_tickets.token_hash and
-- the Edge Function's Web-Crypto SHA-256 lowercase-hex output are
-- UNCHANGED — no re-hash, no Edge redeploy, no data migration.
--
-- Affected functions (recreated here, logic otherwise IDENTICAL):
--   * handle_new_auth_user        (signup claim + replacement lookup uses
--                                  the same hash)
--   * check_upload_receipt_valid
--   * check_upload_receipt_status
-- Ticket status / expiry / receipt lifetime / claim behavior are NOT
-- altered.
--
-- ROLLBACK: restore the three functions from 20260502124000 /
-- 20260502124300. NOT auto-applied.
-- =====================================================================

-- Ensure pgcrypto is available in the extensions schema (idempotent; a
-- no-op where it already exists under any schema).
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Signup trigger — identical to 20260502124000 except the receipt
--    hash is now extensions.digest(convert_to(...,'UTF8'),'sha256').
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload      jsonb;
  v_branches     jsonb;
  v_branch       jsonb;
  v_cats         jsonb;
  v_cat_txt      text;
  v_unified      text;
  v_rep_id       text;
  v_mobile       text;
  v_primary      public.rental_category;
  v_one_cat      public.rental_category;
  v_app_id       uuid;
  v_pos          int := 0;
  v_map          text;
  v_receipt      text;
  v_token_hash   text;
  v_ticket       public.merchant_upload_tickets%rowtype;
  c_map_re       text := '^https://([a-z0-9-]+\.)*(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)';
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

    v_unified := regexp_replace(coalesce(v_payload->>'unified_number', ''), '\D', '', 'g');
    if v_unified !~ '^700[0-9]{7}$' then
      raise exception 'Merchant signup: invalid unified number' using errcode = 'P0120';
    end if;

    v_rep_id := regexp_replace(coalesce(v_payload->>'authorized_national_id', ''), '\D', '', 'g');
    if v_rep_id !~ '^[12][0-9]{9}$' then
      raise exception 'Merchant signup: invalid representative national id' using errcode = 'P0120';
    end if;

    v_mobile := public.canonicalize_saudi_mobile(v_payload->>'contact_mobile');
    if v_mobile is null then
      raise exception 'Merchant signup: invalid contact mobile' using errcode = 'P0120';
    end if;

    v_cats := v_payload->'categories';
    if v_cats is null or jsonb_typeof(v_cats) <> 'array' or jsonb_array_length(v_cats) < 1 then
      if coalesce(trim(v_payload->>'category'), '') <> '' then
        v_cats := jsonb_build_array(v_payload->>'category');
      else
        raise exception 'Merchant signup: at least one activity required' using errcode = 'P0120';
      end if;
    end if;
    begin
      v_primary := (v_cats->>0)::public.rental_category;
    exception when others then
      raise exception 'Merchant signup: invalid category' using errcode = 'P0120';
    end;

    v_branches := v_payload->'branches';
    if v_branches is null
       or jsonb_typeof(v_branches) <> 'array'
       or jsonb_array_length(v_branches) < 1 then
      raise exception 'Merchant signup: at least one branch required' using errcode = 'P0120';
    end if;

    -- Validate + LOCK the CR-document receipt up front. Hash is now
    -- schema-qualified so it resolves under search_path = public.
    v_receipt := nullif(trim(v_payload->>'doc_receipt'), '');
    if v_receipt is null then
      raise exception 'Merchant signup: CR document required' using errcode = 'P0120';
    end if;
    v_token_hash := encode(extensions.digest(convert_to(v_receipt, 'UTF8'), 'sha256'), 'hex');
    select * into v_ticket
      from public.merchant_upload_tickets
     where token_hash = v_token_hash
     for update;
    if not found
       or v_ticket.status <> 'uploaded'
       or v_ticket.expires_at <= now()
       or v_ticket.doc_type <> 'commercial_registration'
       or v_ticket.storage_path is null then
      raise exception 'Merchant signup: invalid or expired document receipt' using errcode = 'P0120';
    end if;

    insert into public.profiles (id, full_name, email, mobile, national_id, city, role, account_status)
    values (
      new.id,
      coalesce(trim(v_payload->>'authorized_name'), new.email),
      new.email,
      null,
      v_rep_id,
      v_branches->0->>'city',
      'merchant',
      'pending'
    )
    on conflict (id) do nothing;

    insert into public.merchant_applications (
      applicant_user_id, company_name, commercial_reg_number, unified_number,
      authorized_name, authorized_national_id, city, primary_category,
      contact_email, contact_phone, status
    ) values (
      new.id,
      trim(v_payload->>'company_name'),
      null,
      v_unified,
      trim(v_payload->>'authorized_name'),
      v_rep_id,
      coalesce(nullif(trim(v_branches->0->>'city'), ''), 'riyadh'),
      v_primary,
      coalesce(nullif(trim(v_payload->>'contact_email'), ''), new.email),
      v_mobile,
      'pending'
    )
    returning id into v_app_id;

    for v_cat_txt in select jsonb_array_elements_text(v_cats) loop
      begin
        v_one_cat := v_cat_txt::public.rental_category;
      exception when others then
        raise exception 'Merchant signup: invalid category' using errcode = 'P0120';
      end;
      insert into public.merchant_application_activities (application_id, category, position)
      values (v_app_id, v_one_cat, v_pos)
      on conflict do nothing;
      v_pos := v_pos + 1;
    end loop;

    v_pos := 0;
    for v_branch in select * from jsonb_array_elements(v_branches) loop
      if coalesce(trim(v_branch->>'name'), '') = ''
         or coalesce(trim(v_branch->>'city'), '') = ''
         or coalesce(trim(v_branch->>'address'), '') = '' then
        raise exception 'Merchant signup: branch name/city/address required' using errcode = 'P0120';
      end if;
      v_map := nullif(trim(coalesce(v_branch->>'map_url', '')), '');
      if v_map is null or v_map !~* c_map_re then
        raise exception 'Merchant signup: invalid branch map link' using errcode = 'P0120';
      end if;
      insert into public.merchant_application_branches
        (application_id, name, city, address, phone, map_url, position)
      values (
        v_app_id,
        trim(v_branch->>'name'),
        trim(v_branch->>'city'),
        trim(v_branch->>'address'),
        nullif(trim(coalesce(v_branch->>'phone', '')), ''),
        v_map,
        v_pos
      );
      v_pos := v_pos + 1;
    end loop;

    update public.merchant_upload_tickets
       set status = 'claimed', claimed_at = now(), claimed_application_id = v_app_id
     where id = v_ticket.id;

    insert into public.merchant_documents (
      application_id, doc_type, storage_path, original_name,
      mime_type, file_size, upload_status, review_status
    ) values (
      v_app_id, 'commercial_registration', v_ticket.storage_path,
      coalesce(v_ticket.original_name, 'commercial-registration'),
      coalesce(v_ticket.mime_type, 'application/octet-stream'),
      coalesce(v_ticket.file_size, 0), 'claimed', 'pending'
    )
    on conflict (application_id, doc_type) where application_id is not null
      do nothing;

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
  'Signup trigger v5: identical to v4 but the CR-receipt hash is schema-qualified extensions.digest(convert_to(...,UTF8),sha256) so it resolves under search_path=public (Supabase installs pgcrypto in the extensions schema). No hash-format change.';

-- ---------------------------------------------------------------------
-- 2. Receipt validity — schema-qualified digest, logic unchanged.
-- ---------------------------------------------------------------------
create or replace function public.check_upload_receipt_valid(p_receipt text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if coalesce(trim(p_receipt), '') = '' then
    return false;
  end if;
  v_hash := encode(extensions.digest(convert_to(p_receipt, 'UTF8'), 'sha256'), 'hex');
  return exists (
    select 1 from public.merchant_upload_tickets
    where token_hash = v_hash
      and status = 'uploaded'
      and expires_at is not null
      and expires_at > now()
      and doc_type = 'commercial_registration'
  );
end;
$$;

revoke all on function public.check_upload_receipt_valid(text) from public;
grant execute on function public.check_upload_receipt_valid(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Receipt status — schema-qualified digest, logic unchanged.
-- ---------------------------------------------------------------------
create or replace function public.check_upload_receipt_status(p_receipt text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash   text;
  v_ticket public.merchant_upload_tickets%rowtype;
begin
  if coalesce(trim(p_receipt), '') = '' then
    return 'missing';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_receipt, 'UTF8'), 'sha256'), 'hex');
  select * into v_ticket
    from public.merchant_upload_tickets
   where token_hash = v_hash;
  if not found then
    return 'missing';
  end if;
  if v_ticket.status = 'claimed' then
    return 'claimed';
  end if;
  if v_ticket.status = 'deleted' then
    return 'deleted';
  end if;
  if v_ticket.status <> 'uploaded'
     or v_ticket.doc_type <> 'commercial_registration'
     or v_ticket.storage_path is null then
    return 'missing';
  end if;
  if v_ticket.expires_at is null or v_ticket.expires_at <= now() then
    return 'expired';
  end if;
  return 'valid';
end;
$$;

revoke all on function public.check_upload_receipt_status(text) from public;
grant execute on function public.check_upload_receipt_status(text) to anon, authenticated;
