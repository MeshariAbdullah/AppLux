-- =====================================================================
-- Bug 2 follow-up — REPAIR: customer mobile uniqueness missing in
-- production + server-side Arabic-digit normalization gap
-- =====================================================================
-- PRODUCTION EVIDENCE (2026-07-19): pg_indexes has NO row for
-- profiles_mobile_customer_unique, and public.profiles contains exact
-- duplicate customer mobiles (e.g. one value repeated 10x). The index
-- was defined by 20260502121200_profiles_mobile_customer_unique.sql,
-- which exists in the repo chain but was evidently never successfully
-- applied to production (its own header documents that it FAILS while
-- duplicate customer mobiles exist — under the project's manual
-- migration process it was either skipped or failed on the existing
-- duplicates and was left unapplied; either way the enforcement never
-- reached production, and without it the signup trigger inserts
-- duplicates freely).
--
-- WHAT THIS FILE DOES (idempotent, additive):
--   (1) Upgrades public.canonicalize_saudi_mobile to normalize
--       Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to
--       ASCII before parsing. The previous body used regexp \D, which
--       classifies Arabic-Indic digits as non-digits and stripped them
--       entirely — a mobile typed on an Arabic keyboard reached the
--       trigger and was stored as NULL. Same signature, same
--       immutability, same result for every input the old body
--       accepted; the existing handle_new_auth_user v3 trigger
--       (20260502122800) picks the new body up automatically for BOTH
--       the customer and merchant paths. Server-side normalization is
--       therefore enforced independently of the client.
--   (2) Creates the partial unique index (same name and definition as
--       20260502121200, so the two files converge):
--
--         create unique index if not exists
--           profiles_mobile_customer_unique
--           on public.profiles (mobile)
--           where role = 'customer' and mobile is not null;
--
--       Customer rows only; merchant/admin rows and NULLs unaffected.
--       Race-safe: concurrent signups with the same mobile serialize
--       on the index — the loser's trigger INSERT fails 23505, GoTrue
--       surfaces "Database error saving new user", and the client
--       maps it to the generic privacy-safe message
--       (auth.errors.accountDetailsConflict). No raw PG/Supabase text
--       reaches the customer.
--
-- CANONICAL STORED FORMAT — unchanged and enforced: `5XXXXXXXX`
-- (9 digits), per the production CHECK constraint
-- profiles_mobile_canonical (20260502120800) and every RPC/edge
-- function that compares mobiles. All accepted inputs
-- (05XXXXXXXX / 9665XXXXXXXX / +9665XXXXXXXX / 009665XXXXXXXX /
-- Arabic-Indic digits / spaces / dashes) collapse to this ONE stored
-- representation; +9665XXXXXXXX is the derived E.164 display/SMS form.
-- Storing the +966-prefixed form instead would violate the live CHECK
-- constraint and require rewriting every existing profiles.mobile row
-- plus the renter-lookup/OTP RPC family — see the accompanying report.
--
-- =====================================================================
-- HARD ORDERING — READ BEFORE APPLYING
-- =====================================================================
-- Step (2) CANNOT be created while duplicates exist. Run the
-- reconciliation + cleanup below FIRST (manual account selection —
-- this migration deliberately modifies NO data), verify zero
-- duplicates, then apply this file. The file is safe to rerun.
--
-- -- (a) READ-ONLY reconciliation — every duplicate customer mobile
-- --     with identity, activity and rental counts for manual review:
--
--   with dupes as (
--     select mobile
--       from public.profiles
--      where role = 'customer' and mobile is not null
--      group by mobile
--     having count(*) > 1
--   )
--   select p.mobile,
--          p.id            as profile_id,
--          p.full_name,
--          p.email,
--          p.created_at,
--          u.last_sign_in_at,
--          (select count(*) from public.rental_contracts c
--            where c.customer_user_id = p.id)             as contracts,
--          (select count(*) from public.rental_invoices i
--            where i.customer_user_id = p.id)             as invoices
--     from public.profiles p
--     join dupes d on d.mobile = p.mobile
--     left join auth.users u on u.id = p.id
--    where p.role = 'customer'
--    order by p.mobile, u.last_sign_in_at desc nulls last, p.created_at;
--
-- -- (b) CLEANUP TEMPLATE — run once per duplicate mobile after a HUMAN
-- --     picks the account that keeps the number. Accounts and all
-- --     related records are preserved; only the duplicate rows' mobile
-- --     becomes NULL (allowed by the CHECK constraint; those accounts
-- --     simply stop matching mobile-based renter lookup until a new
-- --     number is set):
--
--   -- KEEP <keep_profile_id> for mobile '<mobile>'
--   begin;
--   update public.profiles
--      set mobile = null, updated_at = now()
--    where role = 'customer'
--      and mobile = '<mobile>'
--      and id <> '<keep_profile_id>';
--   commit;
--
-- -- (c) VERIFY — must return ZERO rows before applying this file:
--
--   select mobile, count(*)
--     from public.profiles
--    where role = 'customer' and mobile is not null
--    group by mobile
--   having count(*) > 1;
--
-- ROLLBACK of this file:
--   drop index if exists public.profiles_mobile_customer_unique;
--   -- and re-apply the 20260502120800 body of canonicalize_saudi_mobile
--   -- (drops Arabic-digit support; not recommended).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. canonicalize_saudi_mobile — Arabic-Indic digit support
-- ---------------------------------------------------------------------
create or replace function public.canonicalize_saudi_mobile(raw text)
returns text
language sql
immutable
as $$
  with ascii_src as (
    -- Arabic-Indic ٠١٢٣٤٥٦٧٨٩ and Eastern Arabic-Indic ۰۱۲۳۴۵۶۷۸۹ →
    -- ASCII, so \D below no longer destroys Arabic-keyboard input.
    select translate(coalesce(raw, ''),
                     '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                     '01234567890123456789') as t
  ),
  src as (select regexp_replace(t, '\D', '', 'g') as d from ascii_src),
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
-- 2. The missing partial unique index (apply ONLY after cleanup)
-- ---------------------------------------------------------------------
create unique index if not exists profiles_mobile_customer_unique
  on public.profiles (mobile)
  where role = 'customer' and mobile is not null;
