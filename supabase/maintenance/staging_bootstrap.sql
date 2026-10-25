-- =====================================================================
-- Lend — STAGING bootstrap (lend-test ONLY)
-- =====================================================================
-- Run ONCE in the lend-test SQL Editor, AFTER the full migration chain
-- (20260502120000 → 20260502130300) has been applied there.
--
-- What it does:
--   1. SAFETY GATE — refuses to run on anything that looks like a
--      populated/production database (this protects against the biggest
--      foot-gun in this setup: the PRODUCTION project is named
--      "lend-staging", so a mis-picked project in the Dashboard is one
--      click away).
--   2. Writes an environment marker (public.environment_marker) so every
--      future staging-only script can verify the target database
--      mechanically instead of trusting a project name.
--   3. Creates the `damage-evidence` storage bucket — the one object
--      production got from the Dashboard rather than a migration (the
--      migration chain only adds policies to it; without the bucket,
--      handover photos, receipt photos and dispute evidence uploads
--      all fail).
--
-- It does NOT touch auth settings, Edge Functions, or secrets — those
-- are Dashboard/CLI steps (docs/staging-environment.md).
--
-- Idempotent: safe to re-run on lend-test; aborts anywhere else.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. SAFETY GATE
-- ---------------------------------------------------------------------
-- A fresh lend-test right after migrations has zero users and zero
-- business rows. Production has thousands-scale real rows. If this
-- database already carries more rows than the seed scripts themselves
-- could ever have created, it is NOT the staging target — abort before
-- changing anything. Re-runs are allowed only when the marker already
-- says 'staging'.

do $$
declare
  v_marked_env text := null;
  v_users      bigint;
  v_profiles   bigint;
  v_contracts  bigint;
begin
  -- Marker check (table may not exist on first run).
  begin
    execute 'select env from public.environment_marker limit 1'
      into v_marked_env;
  exception when undefined_table then
    v_marked_env := null;
  end;

  if v_marked_env = 'production' then
    raise exception 'ABORT: this database is marked PRODUCTION. staging_bootstrap.sql must never run here.';
  end if;

  if v_marked_env is distinct from 'staging' then
    -- First run: the database must look EMPTY (fresh after migrations).
    -- Thresholds are far below any real production population but allow
    -- a handful of manual test accounts created while setting up.
    select count(*) into v_users     from auth.users;
    select count(*) into v_profiles  from public.profiles;
    select count(*) into v_contracts from public.rental_contracts;

    if v_users > 10 or v_profiles > 10 or v_contracts > 0 then
      raise exception
        'ABORT: database is populated (auth.users=%, profiles=%, rental_contracts=%). '
        'This does not look like a fresh staging project — refusing to mark it as staging. '
        'If you are SURE this is lend-test, investigate where those rows came from first.',
        v_users, v_profiles, v_contracts;
    end if;
  end if;

  -- Migration chain must already be in place (spot-check the newest
  -- objects from 20260502130300): bootstrapping before the chain would
  -- leave a half-configured project that LOOKS done.
  if to_regclass('public.registration_precheck_attempts') is null then
    raise exception
      'ABORT: migration chain not applied (registration_precheck_attempts missing). '
      'Run supabase db push (or apply all 64 migrations) first — see docs/staging-environment.md.';
  end if;

  raise notice 'Safety gate passed: empty database (or already marked staging), migration chain present.';
end $$;

-- ---------------------------------------------------------------------
-- 2. Environment marker
-- ---------------------------------------------------------------------
-- One row, locked down: service_role/SQL-Editor can read it; clients
-- cannot write it. Staging-only scripts (seeds included, if you adopt
-- the pattern) can start with:
--   do $$ begin
--     if (select env from public.environment_marker) <> 'staging'
--       then raise exception 'not staging'; end if;
--   end $$;

create table if not exists public.environment_marker (
  env        text        not null check (env in ('staging', 'production')),
  noted_at   timestamptz not null default now(),
  note       text
);

alter table public.environment_marker enable row level security;
-- No policies on purpose: anon/authenticated get nothing; the SQL
-- Editor (postgres) and service_role bypass RLS.

insert into public.environment_marker (env, note)
select 'staging', 'lend-test — bootstrapped by supabase/maintenance/staging_bootstrap.sql'
where not exists (select 1 from public.environment_marker);

-- ---------------------------------------------------------------------
-- 3. damage-evidence bucket (the Dashboard-created gap)
-- ---------------------------------------------------------------------
-- Private bucket; limits mirror merchant-documents' migration-defined
-- shape, sized for photo evidence. The app uploads jpeg/png/webp photos
-- (handover/, receipts/, and dispute evidence paths); RLS policies for
-- all three path families already exist from migrations 121100, 122900
-- and 124700. If production's Dashboard values differ, adjust here to
-- match — but these are safe, functional defaults for staging.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'damage-evidence', 'damage-evidence', false, 10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;

-- ---------------------------------------------------------------------
-- Done. Next: supabase/maintenance/staging_verify.sql (read-only).
-- ---------------------------------------------------------------------
select 'staging_bootstrap complete' as status,
       (select env from public.environment_marker) as environment,
       (select count(*) from storage.buckets where id in ('damage-evidence','merchant-documents')) as buckets_present;
