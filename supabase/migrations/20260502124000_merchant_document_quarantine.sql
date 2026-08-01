-- =====================================================================
-- Merchant onboarding enhancements — Commit A (2/2): document quarantine.
--
-- The onboarding wizard is a single anonymous auth.signUp; there is no
-- session and no application row until submit. To let Step 5 upload the
-- required Commercial Registration copy SECURELY before Review, without a
-- broad anonymous Storage policy:
--
--   * A controlled Edge Function (service role) validates the file
--     (PDF/JPG/PNG, ≤5MB, magic-byte sniff, no executables), writes it to
--     a PRIVATE bucket under quarantine/<ticket_id>/, and issues a
--     high-entropy, single-use, short-lived OPAQUE receipt. Only the SHA-
--     256 hash of the receipt is stored here; the raw token carries no
--     merchant/user/application/DB id.
--   * The bucket has NO anon and NO end-user write policy at all — every
--     write goes through the service-role function.
--   * At signup the client sends only the opaque receipt in metadata. The
--     trusted AFTER-INSERT trigger validates it (unused + unexpired + right
--     doc type), marks it claimed, and writes the merchant_documents row —
--     atomically, in the same transaction as the application. No valid
--     claim ⇒ the signup aborts ⇒ the application can never be reviewable
--     without its CR copy.
--   * Reads use short-lived signed URLs, authorized by the
--     merchant_documents ownership policy (owning merchant / admin).
--   * Orphaned quarantine objects + tickets are purged after 24h by the
--     scheduled merchant-doc-cleanup function.
--
-- ROLLBACK (manual): revert handle_new_auth_user to the 20260502122800
-- body; drop the storage policies + the 'merchant-documents' bucket row;
-- drop public.merchant_upload_tickets. Nothing else is touched.
--
-- NOT auto-applied. Edge Functions are NOT auto-deployed.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. merchant_upload_tickets — the opaque draft-upload receipts.
-- ---------------------------------------------------------------------
create table if not exists public.merchant_upload_tickets (
  id                     uuid primary key default gen_random_uuid(),
  token_hash             text not null unique,        -- sha256 hex of the raw receipt
  doc_type               text not null default 'commercial_registration',
  status                 text not null default 'uploaded',  -- uploaded | claimed | deleted | expired
  storage_path           text,
  original_name          text,
  mime_type              text,
  file_size              bigint,
  ip_hash                text,
  claimed_application_id uuid references public.merchant_applications(id) on delete set null,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default now() + interval '30 minutes',
  uploaded_at            timestamptz,
  claimed_at             timestamptz,
  constraint merchant_upload_tickets_status
    check (status in ('uploaded', 'claimed', 'deleted', 'expired'))
);

create index if not exists merchant_upload_tickets_status_idx
  on public.merchant_upload_tickets(status, expires_at);
create index if not exists merchant_upload_tickets_ip_idx
  on public.merchant_upload_tickets(ip_hash, created_at);

-- RLS on. NO policies for anon/authenticated: the table is touched ONLY
-- by the service-role Edge Function and by the SECURITY DEFINER signup
-- trigger (both bypass RLS). End users can never read a ticket.
alter table public.merchant_upload_tickets enable row level security;

-- ---------------------------------------------------------------------
-- 2. Private bucket + read-only RLS (no anon, no end-user writes).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-documents', 'merchant-documents', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- Authenticated owners/admins may SELECT (⇒ mint short-lived signed URLs)
-- ONLY objects that resolve to one of their own merchant_documents rows.
-- Anonymous access is impossible — there is no anon policy anywhere, and
-- direct writes are impossible — there is no INSERT/UPDATE/DELETE policy
-- for end users on this bucket.
drop policy if exists merchant_documents_object_owner_select on storage.objects;
create policy merchant_documents_object_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'merchant-documents'
    and exists (
      select 1 from public.merchant_documents md
      where md.storage_path = storage.objects.name
        and (
          (md.application_id is not null and exists (
            select 1 from public.merchant_applications a
            where a.id = md.application_id and a.applicant_user_id = auth.uid()
          ))
          or (md.merchant_id is not null and public.is_merchant_owner(md.merchant_id))
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------
-- 3. Signup trigger rewrite — unified number, activities[], branch
--    map_url, and the atomic CR-document receipt claim.
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

    -- Establishment Unified Number (700-series) — replaces the CR number
    -- as the entered field. Digits only, 10 long, begins with 700.
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

    -- Activities: an array of ≥1 valid category. primary_category = the
    -- first. Back-compat: accept the legacy single `category` too.
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

    -- Validate + LOCK the CR-document receipt up front (fail fast). The
    -- claim itself happens after the application row exists.
    v_receipt := nullif(trim(v_payload->>'doc_receipt'), '');
    if v_receipt is null then
      raise exception 'Merchant signup: CR document required' using errcode = 'P0120';
    end if;
    v_token_hash := encode(digest(v_receipt, 'sha256'), 'hex');
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
      null,                    -- CR number no longer entered; CR copy is uploaded
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

    -- Activities (dedup by unique pk).
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

    -- Branches (each now requires a valid Google-Maps link).
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

    -- Claim the receipt + record the document, atomically with the above.
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
  'Signup trigger v4: merchant branch now takes unified_number (700), categories[] (primary = first), branch map_url (required), and atomically claims the quarantined CR-document receipt into merchant_documents. Customer branch unchanged.';

-- ---------------------------------------------------------------------
-- 4. Cleanup helper — list quarantine objects to purge (>24h, unclaimed).
--    The scheduled Edge Function calls this, deletes the objects via the
--    Storage API, then finalizes the tickets. SECURITY DEFINER so the
--    function can run it with a service context.
-- ---------------------------------------------------------------------
create or replace function public.list_orphaned_upload_tickets()
returns table (id uuid, storage_path text)
language sql
security definer
set search_path = public
as $$
  select id, storage_path
  from public.merchant_upload_tickets
  where status in ('uploaded', 'expired')
    and created_at < now() - interval '24 hours';
$$;

revoke all on function public.list_orphaned_upload_tickets() from public, anon, authenticated;

create or replace function public.finalize_orphaned_upload_ticket(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.merchant_upload_tickets
     set status = 'expired', storage_path = null
   where id = p_id and status in ('uploaded', 'expired');
$$;

revoke all on function public.finalize_orphaned_upload_ticket(uuid) from public, anon, authenticated;
