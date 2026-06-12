-- =====================================================================
-- Lend MVP — Phase 7g unique customer mobile
-- =====================================================================
-- SCRUM-42 Bug 15: the registration flow currently allows two customer
-- accounts to share a mobile. With renter lookup + presence-check now
-- the primary verification factor (lookup_renter_by_mobile +
-- confirm_renter_presence), duplicates are a real data-integrity
-- hazard: the lookup returns LIMIT 1 arbitrarily, and the presence
-- RPC returns nothing when matches are ambiguous (see
-- 20260502120900). Customers caught in this state can't be verified
-- by the merchant.
--
-- This migration installs a PARTIAL unique index that prevents two
-- customer profiles from sharing a non-null mobile, while leaving
-- merchant / admin rows and rows with NULL mobile alone.
--
-- It is idempotent — `if not exists` covers re-runs. It will FAIL if
-- the live data already contains duplicate customer mobiles; in that
-- case follow the diagnostic + resolution SQL from
-- 20260502120900_harden_renter_presence_against_duplicates.sql's
-- response text (scrub the duplicate's mobile or suspend it) and
-- then re-run this migration.
-- =====================================================================

create unique index if not exists profiles_mobile_customer_unique
  on public.profiles (mobile)
  where role = 'customer' and mobile is not null;
