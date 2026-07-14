-- =====================================================================
-- Separate merchant registration — M1 (1/2): application draft branches
-- + application uniqueness constraints.
--
-- New model: a merchant applicant submits ≥1 branch with the
-- application. Branches stay PRIVATE (applicant + admin only) until
-- approval copies them into public.merchant_branches, whose existing
-- public policy only exposes branches of ACTIVE merchants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- merchant_application_branches — draft branches attached to an
-- application. Plain text fields at this stage; provisioning maps them
-- into merchant_branches' jsonb {ar,en} shape.
-- ---------------------------------------------------------------------
create table public.merchant_application_branches (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.merchant_applications(id) on delete cascade,
  name           text not null,
  city           text not null,
  address        text not null,
  phone          text,
  position       int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index merchant_application_branches_app_idx
  on public.merchant_application_branches(application_id);

alter table public.merchant_application_branches enable row level security;

-- Applicant: READ ONLY, and only branches of their own applications.
-- There is deliberately NO insert/update/delete policy for applicants —
-- rows are written exclusively by the trusted signup path (SECURITY
-- DEFINER trigger, M2) and admins. A submitted application cannot be
-- altered by its applicant, matching merchant_applications policies.
create policy merchant_application_branches_applicant_select
  on public.merchant_application_branches
  for select using (
    exists (
      select 1 from public.merchant_applications a
      where a.id = merchant_application_branches.application_id
        and a.applicant_user_id = auth.uid()
    )
  );

create policy merchant_application_branches_admin_all
  on public.merchant_application_branches
  for all using (public.is_admin()) with check (public.is_admin());

-- NO public policy: draft branches can never appear in store queries.

-- ---------------------------------------------------------------------
-- Application uniqueness — one live (pending) application per
-- applicant, and one live application per commercial registration
-- number. Approval/rejection frees the slot; global CR uniqueness
-- after approval is already enforced by merchants.commercial_reg_number.
-- ---------------------------------------------------------------------
create unique index if not exists merchant_applications_one_pending_per_user
  on public.merchant_applications (applicant_user_id)
  where status = 'pending';

create unique index if not exists merchant_applications_one_pending_per_cr
  on public.merchant_applications (commercial_reg_number)
  where status = 'pending';
