-- =====================================================================
-- AppLux MVP — Phase 1 initial schema
-- =====================================================================
-- Defines extensions, enums, core tables, indexes, and sequences.
-- No RLS, triggers, or helper functions here — those land in subsequent
-- migrations so each file stays focused.
--
-- Conventions:
--   * UUID primary keys via gen_random_uuid()
--   * Timestamps use timestamptz; updated_at maintained by trigger (next file)
--   * Money stored as numeric(12,2) in SAR
--   * Localized text stored as jsonb { ar: text, en: text }
--   * Enums for finite status / category fields
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------

create type public.app_role as enum ('customer', 'merchant', 'admin');

create type public.account_status as enum ('pending', 'active', 'suspended');

create type public.merchant_application_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.merchant_status as enum (
  'pending_review',
  'active',
  'suspended'
);

create type public.rental_category as enum ('dress', 'bag', 'watch', 'bisht');

create type public.eligibility_tier as enum ('standard', 'premium', 'elite');

create type public.invoice_status as enum (
  'draft',
  'issued',
  'viewed',
  'accepted',
  'rejected',
  'cancelled',
  'superseded'
);

create type public.contract_status as enum (
  'pending',
  'active',
  'ended',
  'cancelled'
);

create type public.note_status as enum (
  'pending',
  'signed',
  'settled',
  'defaulted'
);

create type public.damage_severity as enum ('partial', 'total', 'non_return');
create type public.damage_stage    as enum ('review', 'settlement', 'nafith', 'execution');
create type public.damage_status   as enum ('open', 'settled', 'escalated', 'dismissed');

create type public.evidence_type as enum ('photo', 'video', 'document');

-- ---------------------------------------------------------------------
-- Sequences for human-readable document numbers
-- ---------------------------------------------------------------------

create sequence public.invoice_number_seq  start 100000;
create sequence public.contract_number_seq start 100000;
create sequence public.note_number_seq     start 100000;
create sequence public.case_number_seq     start 100000;
create sequence public.merchant_app_seq    start 1000;

-- ---------------------------------------------------------------------
-- profiles — public mirror of auth.users
-- ---------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  mobile              text,
  email               citext,
  national_id         text,
  city                text,
  role                app_role        not null default 'customer',
  account_status      account_status  not null default 'pending',
  -- Placeholder for future Nafath integration (Phase 3+)
  nafath_verified_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index profiles_role_idx           on public.profiles(role);
create index profiles_account_status_idx on public.profiles(account_status);
create index profiles_city_idx           on public.profiles(city);

-- ---------------------------------------------------------------------
-- merchant_applications — customer applies to become a merchant;
-- admin reviews and approves / rejects
-- ---------------------------------------------------------------------

create table public.merchant_applications (
  id                       uuid primary key default gen_random_uuid(),
  applicant_user_id        uuid not null references public.profiles(id) on delete cascade,
  -- Operational
  company_name             text not null,
  commercial_reg_number    text not null,
  authorized_name          text not null,
  authorized_national_id   text not null,
  city                     text not null,
  primary_category         rental_category not null,
  contact_email            citext,
  contact_phone            text,
  notes                    text,
  -- Lifecycle
  status                   merchant_application_status not null default 'pending',
  decided_by               uuid references public.profiles(id),
  decided_at               timestamptz,
  decision_notes           text,
  submitted_at             timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index merchant_applications_applicant_idx on public.merchant_applications(applicant_user_id);
create index merchant_applications_status_idx    on public.merchant_applications(status);
create index merchant_applications_city_idx      on public.merchant_applications(city);

-- ---------------------------------------------------------------------
-- merchants — operational + consumer-facing boutique data unified
-- ---------------------------------------------------------------------

create table public.merchants (
  id                       uuid primary key default gen_random_uuid(),
  owner_user_id            uuid not null unique
                              references public.profiles(id) on delete restrict,
  application_id           uuid unique
                              references public.merchant_applications(id) on delete set null,
  -- Operational
  company_name             text not null,
  commercial_reg_number    text not null unique,
  -- Consumer-facing boutique brand
  display_name             jsonb not null,           -- { ar, en }
  about                    jsonb,                    -- { ar, en }
  primary_category         rental_category not null,
  city                     text not null,
  -- Reputation
  verified                 boolean not null default false,
  rating                   numeric(3,2) not null default 0,
  rating_count             integer       not null default 0,
  -- Lifecycle
  status                   merchant_status not null default 'pending_review',
  approved_at              timestamptz,
  approved_by              uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index merchants_status_idx   on public.merchants(status);
create index merchants_city_idx     on public.merchants(city);
create index merchants_category_idx on public.merchants(primary_category);
create index merchants_verified_idx on public.merchants(verified);

-- ---------------------------------------------------------------------
-- merchant_branches — physical pickup / drop-off locations
-- ---------------------------------------------------------------------

create table public.merchant_branches (
  id                       uuid primary key default gen_random_uuid(),
  merchant_id              uuid not null references public.merchants(id) on delete cascade,
  name                     jsonb not null,           -- { ar, en }
  city                     text not null,
  address                  jsonb,                    -- { ar, en }
  phone                    text,
  hours_open               time,
  hours_close              time,
  is_primary               boolean not null default false,
  -- Geo placeholders for future map integration
  geo_lat                  numeric(9,6),
  geo_lng                  numeric(9,6),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index merchant_branches_merchant_idx on public.merchant_branches(merchant_id);
create index merchant_branches_city_idx     on public.merchant_branches(city);

-- ---------------------------------------------------------------------
-- rental_eligibility — admin-assigned credit ceiling per customer
-- ---------------------------------------------------------------------

create table public.rental_eligibility (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  limit_amount   numeric(12,2) not null default 0,
  used_amount    numeric(12,2) not null default 0,
  tier           eligibility_tier not null default 'standard',
  assigned_by    uuid references public.profiles(id),
  assigned_at    timestamptz not null default now(),
  notes          text,
  updated_at     timestamptz not null default now(),
  constraint rental_eligibility_used_within_limit
    check (used_amount >= 0 and used_amount <= limit_amount)
);

-- ---------------------------------------------------------------------
-- rental_invoices — issued by merchant; customer scans QR to review
-- ---------------------------------------------------------------------

create table public.rental_invoices (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text not null unique,
  merchant_id         uuid not null references public.merchants(id) on delete restrict,
  branch_id           uuid references public.merchant_branches(id) on delete set null,
  customer_user_id    uuid not null references public.profiles(id) on delete restrict,
  -- Money
  subtotal_amount     numeric(12,2) not null default 0,
  tax_amount          numeric(12,2) not null default 0,
  security_deposit    numeric(12,2) not null default 0,
  total_amount        numeric(12,2) not null default 0,
  -- Lifecycle
  status              invoice_status not null default 'draft',
  issued_at           timestamptz,
  expires_at          timestamptz,
  -- One-time token used for QR-scan review
  scan_token          text unique,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index rental_invoices_customer_idx on public.rental_invoices(customer_user_id);
create index rental_invoices_merchant_idx on public.rental_invoices(merchant_id);
create index rental_invoices_status_idx   on public.rental_invoices(status);
create index rental_invoices_token_idx    on public.rental_invoices(scan_token);

-- ---------------------------------------------------------------------
-- rental_invoice_items — line items inside an invoice
-- ---------------------------------------------------------------------

create table public.rental_invoice_items (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.rental_invoices(id) on delete cascade,
  position            integer not null default 0,
  item_name           text not null,
  category            rental_category not null,
  size_label          text,
  color               text,
  daily_rate          numeric(12,2) not null,
  rental_days         integer not null check (rental_days > 0),
  subtotal            numeric(12,2) not null,
  -- Used to calibrate damage claim / promissory note principal
  replacement_value   numeric(12,2),
  notes               text,
  created_at          timestamptz not null default now()
);

create index rental_invoice_items_invoice_idx on public.rental_invoice_items(invoice_id);

-- ---------------------------------------------------------------------
-- rental_contracts — created when customer accepts an invoice
-- ---------------------------------------------------------------------

create table public.rental_contracts (
  id                       uuid primary key default gen_random_uuid(),
  contract_number          text not null unique,
  invoice_id               uuid not null unique
                              references public.rental_invoices(id) on delete restrict,
  customer_user_id         uuid not null references public.profiles(id) on delete restrict,
  merchant_id              uuid not null references public.merchants(id) on delete restrict,
  branch_id                uuid references public.merchant_branches(id) on delete set null,
  -- Period
  start_date               date not null,
  end_date                 date not null,
  -- Money (frozen at signing, mirrors invoice)
  rental_fee_amount        numeric(12,2) not null,
  security_deposit         numeric(12,2) not null default 0,
  total_amount             numeric(12,2) not null,
  -- Lifecycle
  status                   contract_status not null default 'pending',
  signed_at                timestamptz,
  ended_at                 timestamptz,
  -- Placeholders for future identity / attestation integrations
  nafath_verified_at       timestamptz,
  nafith_attested_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint rental_contracts_period_valid check (end_date > start_date)
);

create index rental_contracts_customer_idx on public.rental_contracts(customer_user_id);
create index rental_contracts_merchant_idx on public.rental_contracts(merchant_id);
create index rental_contracts_status_idx   on public.rental_contracts(status);

-- ---------------------------------------------------------------------
-- promissory_notes — separate signed financial instrument tied to contract
-- ---------------------------------------------------------------------

create table public.promissory_notes (
  id                       uuid primary key default gen_random_uuid(),
  reference_number         text not null unique,
  contract_id              uuid not null unique
                              references public.rental_contracts(id) on delete restrict,
  customer_user_id         uuid not null references public.profiles(id) on delete restrict,
  merchant_id              uuid not null references public.merchants(id) on delete restrict,
  beneficiary_name         text not null,
  principal_amount         numeric(12,2) not null,
  due_date                 date not null,
  status                   note_status not null default 'pending',
  signed_at                timestamptz,
  settled_at               timestamptz,
  defaulted_at             timestamptz,
  -- Placeholder for future Nafith attestation
  nafith_attested_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index promissory_notes_customer_idx on public.promissory_notes(customer_user_id);
create index promissory_notes_merchant_idx on public.promissory_notes(merchant_id);
create index promissory_notes_status_idx   on public.promissory_notes(status);

-- ---------------------------------------------------------------------
-- damage_cases — raised by merchant when item returned damaged or
-- not at all; admin oversees resolution
-- ---------------------------------------------------------------------

create table public.damage_cases (
  id                       uuid primary key default gen_random_uuid(),
  case_number              text not null unique,
  contract_id              uuid not null references public.rental_contracts(id) on delete restrict,
  customer_user_id         uuid not null references public.profiles(id) on delete restrict,
  merchant_id              uuid not null references public.merchants(id) on delete restrict,
  raised_by_user_id        uuid references public.profiles(id),
  severity                 damage_severity not null,
  stage                    damage_stage    not null default 'review',
  status                   damage_status   not null default 'open',
  claim_amount             numeric(12,2) not null default 0,
  description              text not null,
  raised_at                timestamptz not null default now(),
  resolved_at              timestamptz,
  resolved_by_user_id      uuid references public.profiles(id),
  resolution_notes         text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index damage_cases_contract_idx on public.damage_cases(contract_id);
create index damage_cases_merchant_idx on public.damage_cases(merchant_id);
create index damage_cases_customer_idx on public.damage_cases(customer_user_id);
create index damage_cases_status_idx   on public.damage_cases(status);
create index damage_cases_stage_idx    on public.damage_cases(stage);

-- ---------------------------------------------------------------------
-- damage_evidence — photos / videos / documents attached to a case
-- (binary content lives in Supabase Storage; storage_path is the key)
-- ---------------------------------------------------------------------

create table public.damage_evidence (
  id                       uuid primary key default gen_random_uuid(),
  case_id                  uuid not null references public.damage_cases(id) on delete cascade,
  evidence_type            evidence_type not null default 'photo',
  storage_path             text not null,
  caption                  text,
  uploaded_by_user_id      uuid references public.profiles(id),
  uploaded_at              timestamptz not null default now()
);

create index damage_evidence_case_idx on public.damage_evidence(case_id);
