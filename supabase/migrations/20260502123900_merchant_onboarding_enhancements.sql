-- =====================================================================
-- Merchant onboarding enhancements — Commit A (1/2): schema + approval.
--
-- Adds, all idempotently and without destructive data loss:
--   1. `unified_number` (Saudi establishment Unified Number, 700-series)
--      on merchants + applications. Canonical text field, format-checked,
--      unique when non-null. `commercial_reg_number` is made NULLABLE and
--      PRESERVED (new onboarding uploads a CR *copy* instead of typing the
--      number). Existing values backfilled into `unified_number` ONLY when
--      they already match 700 + 7 digits — invalid legacy numbers are kept
--      as-is and the merchant must supply the unified number on next edit.
--   2. Multi-activity relationship tables (merchant_activities /
--      merchant_application_activities), replacing the single
--      `primary_category` scalar as the source of truth. `primary_category`
--      is KEPT (= first selected activity) for backward compatibility with
--      contract-template / rental-session code that still reads the enum.
--      Existing single categories are backfilled into the new tables.
--   3. `map_url` (Google Maps location link) on both branch tables.
--   4. `merchant_documents` metadata (extensible; first type is the CR
--      copy). RLS: owning applicant/merchant + admins read; no end-user
--      writes (rows are created by the trusted signup claim / admins).
--   5. `approve_merchant_application` extended to copy unified_number,
--      activities, branch map_url, and to bind claimed documents to the
--      provisioned merchant.
--
-- The quarantine upload tickets, storage bucket/policies, and the signup
-- trigger rewrite live in the companion migration (…124000).
--
-- ROLLBACK (manual): drop merchant_documents, merchant_activities,
-- merchant_application_activities; drop the unified_number / map_url
-- columns, their checks and indexes; `alter table … alter column
-- commercial_reg_number set not null` (only if every row has a value);
-- and restore the prior approve_merchant_application body from
-- 20260502122700. No data outside these objects is touched.
--
-- NOT auto-applied. Read-only impact query at the bottom (commented).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Establishment Unified Number (700-series)
-- ---------------------------------------------------------------------
alter table public.merchants
  add column if not exists unified_number text;
alter table public.merchant_applications
  add column if not exists unified_number text;

do $$ begin
  alter table public.merchants
    add constraint merchants_unified_number_format
    check (unified_number is null or unified_number ~ '^700[0-9]{7}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.merchant_applications
    add constraint merchant_applications_unified_number_format
    check (unified_number is null or unified_number ~ '^700[0-9]{7}$');
exception when duplicate_object then null; end $$;

-- Global uniqueness on merchants; pending-scoped on applications (a
-- rejected application frees the number, mirroring the CR partial index).
create unique index if not exists merchants_unified_number_unique
  on public.merchants (unified_number)
  where unified_number is not null;

create unique index if not exists merchant_applications_unified_pending_unique
  on public.merchant_applications (unified_number)
  where unified_number is not null and status = 'pending';

-- The CR *number* is no longer entered during onboarding (the CR *copy*
-- is uploaded instead). Make the legacy column nullable but keep it +
-- its unique index for existing merchants and any admin backfill.
alter table public.merchants
  alter column commercial_reg_number drop not null;
alter table public.merchant_applications
  alter column commercial_reg_number drop not null;

-- Backfill: only a value that is ALREADY a valid unified number. Invalid
-- legacy registration numbers are deliberately preserved, never coerced.
update public.merchants
   set unified_number = commercial_reg_number
 where unified_number is null
   and commercial_reg_number ~ '^700[0-9]{7}$';

update public.merchant_applications
   set unified_number = commercial_reg_number
 where unified_number is null
   and commercial_reg_number ~ '^700[0-9]{7}$';

-- ---------------------------------------------------------------------
-- 2. Multi-activity relationship tables
-- ---------------------------------------------------------------------
create table if not exists public.merchant_activities (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  category    public.rental_category not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (merchant_id, category)
);
create index if not exists merchant_activities_category_idx
  on public.merchant_activities(category);

create table if not exists public.merchant_application_activities (
  application_id uuid not null references public.merchant_applications(id) on delete cascade,
  category       public.rental_category not null,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  primary key (application_id, category)
);

alter table public.merchant_activities enable row level security;
alter table public.merchant_application_activities enable row level security;

-- Public read for ACTIVE merchants' activities (store page + discovery
-- filter), mirroring merchant_branches_public_select.
drop policy if exists merchant_activities_public_select on public.merchant_activities;
create policy merchant_activities_public_select on public.merchant_activities
  for select using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_activities.merchant_id and m.status = 'active'
    )
  );
drop policy if exists merchant_activities_owner_all on public.merchant_activities;
create policy merchant_activities_owner_all on public.merchant_activities
  for all using (public.is_merchant_owner(merchant_id))
         with check (public.is_merchant_owner(merchant_id));
drop policy if exists merchant_activities_admin_all on public.merchant_activities;
create policy merchant_activities_admin_all on public.merchant_activities
  for all using (public.is_admin()) with check (public.is_admin());

-- Draft activities: applicant read-only (written by the trusted signup
-- path + admins), mirroring merchant_application_branches.
drop policy if exists merchant_application_activities_applicant_select
  on public.merchant_application_activities;
create policy merchant_application_activities_applicant_select
  on public.merchant_application_activities
  for select using (
    exists (
      select 1 from public.merchant_applications a
      where a.id = merchant_application_activities.application_id
        and a.applicant_user_id = auth.uid()
    )
  );
drop policy if exists merchant_application_activities_admin_all
  on public.merchant_application_activities;
create policy merchant_application_activities_admin_all
  on public.merchant_application_activities
  for all using (public.is_admin()) with check (public.is_admin());

-- Backfill existing single categories into the multi-activity tables.
insert into public.merchant_activities (merchant_id, category, position)
  select id, primary_category, 0 from public.merchants
  on conflict do nothing;
insert into public.merchant_application_activities (application_id, category, position)
  select id, primary_category, 0 from public.merchant_applications
  on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Branch Google Maps location link
-- ---------------------------------------------------------------------
alter table public.merchant_branches
  add column if not exists map_url text;
alter table public.merchant_application_branches
  add column if not exists map_url text;

-- HTTPS Google-Maps hosts only; NULL allowed (legacy branches until
-- edited). Mirrors the client-side validator.
do $$ begin
  alter table public.merchant_branches
    add constraint merchant_branches_map_url_https
    check (
      map_url is null or map_url ~* '^https://([a-z0-9-]+\.)*(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)'
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.merchant_application_branches
    add constraint merchant_application_branches_map_url_https
    check (
      map_url is null or map_url ~* '^https://([a-z0-9-]+\.)*(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)'
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4. merchant_documents — verification document metadata
-- ---------------------------------------------------------------------
create table if not exists public.merchant_documents (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid references public.merchant_applications(id) on delete cascade,
  merchant_id     uuid references public.merchants(id) on delete set null,
  doc_type        text not null,
  storage_path    text not null,
  original_name   text not null,
  mime_type       text not null,
  file_size       bigint not null,
  upload_status   text not null default 'uploaded',
  review_status   text not null default 'pending',
  uploaded_at     timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles(id),
  rejection_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint merchant_documents_scope
    check (application_id is not null or merchant_id is not null),
  constraint merchant_documents_upload_status
    check (upload_status in ('uploaded', 'failed', 'claimed')),
  constraint merchant_documents_review_status
    check (review_status in ('pending', 'approved', 'rejected'))
);

create index if not exists merchant_documents_app_idx
  on public.merchant_documents(application_id);
create index if not exists merchant_documents_merchant_idx
  on public.merchant_documents(merchant_id);
-- Idempotency: one document of a given type per application. A retried
-- signup claim upserts rather than duplicating.
create unique index if not exists merchant_documents_app_type_unique
  on public.merchant_documents(application_id, doc_type)
  where application_id is not null;

alter table public.merchant_documents enable row level security;

-- Owning applicant (via their application) or owning merchant may READ
-- their own documents; admins read all. No end-user INSERT/UPDATE/DELETE
-- policy — rows are written only by the SECURITY DEFINER signup claim and
-- by admins (review) via the admin policy below.
drop policy if exists merchant_documents_owner_select on public.merchant_documents;
create policy merchant_documents_owner_select on public.merchant_documents
  for select using (
    (application_id is not null and exists (
      select 1 from public.merchant_applications a
      where a.id = merchant_documents.application_id
        and a.applicant_user_id = auth.uid()
    ))
    or (merchant_id is not null and public.is_merchant_owner(merchant_id))
  );
drop policy if exists merchant_documents_admin_all on public.merchant_documents;
create policy merchant_documents_admin_all on public.merchant_documents
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. approve_merchant_application — carry the new fields onto the
--    provisioned merchant. Idempotent; superset of the 122700 body.
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

  select m.id into v_merchant_id
    from public.merchants m
   where m.application_id = p_application_id;

  if v_merchant_id is null then
    insert into public.merchants (
      owner_user_id, application_id, company_name, commercial_reg_number,
      unified_number, display_name, primary_category, city, status, verified,
      approved_at, approved_by
    ) values (
      v_app.applicant_user_id,
      v_app.id,
      v_app.company_name,
      v_app.commercial_reg_number,
      v_app.unified_number,
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

  -- Copy multi-activities once (superset of primary_category).
  insert into public.merchant_activities (merchant_id, category, position)
    select v_merchant_id, aa.category, aa.position
      from public.merchant_application_activities aa
     where aa.application_id = p_application_id
  on conflict do nothing;
  -- Safety net for legacy applications with no draft activity rows.
  insert into public.merchant_activities (merchant_id, category, position)
    values (v_merchant_id, v_app.primary_category, 0)
  on conflict do nothing;

  -- Copy draft branches exactly once (now including map_url).
  if not exists (
    select 1 from public.merchant_branches b where b.merchant_id = v_merchant_id
  ) then
    insert into public.merchant_branches (
      merchant_id, name, city, address, phone, map_url, is_primary
    )
    select
      v_merchant_id,
      jsonb_build_object('ar', ab.name, 'en', ab.name),
      ab.city,
      jsonb_build_object('ar', ab.address, 'en', ab.address),
      ab.phone,
      ab.map_url,
      (ab.position = 0)
    from public.merchant_application_branches ab
    where ab.application_id = p_application_id
    order by ab.position;
  end if;

  -- Bind claimed documents to the provisioned merchant (RLS then also
  -- authorizes the owning merchant, not only the pending applicant).
  update public.merchant_documents
     set merchant_id = v_merchant_id, updated_at = now()
   where application_id = p_application_id
     and merchant_id is distinct from v_merchant_id;

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
  'Idempotent admin approval — creates/reuses the merchants row (with unified_number), copies activities + draft branches (incl. map_url) once, binds claimed documents, activates the account.';

-- ---------------------------------------------------------------------
-- Read-only impact query (run BEFORE applying, in a transaction you roll
-- back, to size the change):
--
--   select
--     (select count(*) from public.merchants) as merchants,
--     (select count(*) from public.merchants where commercial_reg_number ~ '^700[0-9]{7}$') as merchants_backfillable,
--     (select count(*) from public.merchants where commercial_reg_number is not null and commercial_reg_number !~ '^700[0-9]{7}$') as merchants_needing_reentry,
--     (select count(*) from public.merchant_applications where status = 'pending') as pending_apps,
--     (select count(*) from public.merchant_branches) as live_branches;
-- ---------------------------------------------------------------------
