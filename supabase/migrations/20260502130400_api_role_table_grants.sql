-- =====================================================================
-- API-role table privileges — least-privilege, explicit, per table
-- =====================================================================
-- WHY THIS MIGRATION EXISTS
--
-- Supabase projects created since the Data-API privilege change (the
-- staging project lend-test, created 2026-10, is one) no longer give
-- the API roles data access to new tables: pg_default_acl for tables
-- created by `postgres` grants anon/authenticated/service_role NO
-- SELECT/INSERT/UPDATE/DELETE. Older projects (production) auto-granted
-- full data privileges and relied on RLS to gate rows — which is why
-- the app works there with almost no explicit GRANTs in this chain.
--
-- This migration makes the privilege model EXPLICIT and MINIMAL, from
-- an audit of every direct PostgREST table/sequence operation in the
-- frontend (src/lib/supabase/queries/**, grep of .from('…').select/
-- insert/update/upsert) and in the six Edge Functions. Everything else
-- goes through SECURITY DEFINER RPCs (owner postgres = table owner),
-- which need no table grants, and whose EXECUTE grants/revokes this
-- chain already manages explicitly (80 grant-execute statements; the
-- sensitive revokes — e.g. list_orphaned_upload_tickets,
-- registration_otp_precheck — remain untouched by this file).
--
-- THE MATRIX (everything not listed is deliberately NOT granted):
--
--   anon            → NOTHING. No public screen reads tables directly;
--                     pre-auth flows are RPC + Edge Function only.
--   authenticated   → SELECT on the 21 tables the signed-in app reads;
--                     INSERT on 6; UPDATE on 4; USAGE on the 4
--                     numbering sequences consumed by the non-SECURITY-
--                     DEFINER next_* RPCs. No DELETE anywhere (the app
--                     has none; removals are RPC-gated).
--   service_role    → only what the Edge Functions touch directly:
--                     merchant_upload_tickets (select/insert/update,
--                     for merchant-doc-upload) and profiles (select,
--                     for otp-send). Its other flows are RPC/storage.
--
--   NO grants on: environment_marker (stays invisible to every API
--   role, service_role included), registration_otp_challenges,
--   renter_otp_challenges, registration_precheck_attempts, push_jobs,
--   merchant_app_seq. No TRUNCATE/TRIGGER/REFERENCES/MAINTAIN is
--   granted by this file to anyone.
--
-- Every granted table has RLS ENABLED with policies from this chain —
-- grants decide which VERBS a role may attempt; RLS decides which ROWS
-- they reach. anon keeps zero data verbs, so even RLS is moot for it.
--
-- PRODUCTION COMPATIBILITY: additive and idempotent. On the production
-- project these privileges already exist (as part of the old broader
-- defaults), so applying this file there is a no-op in effect — it
-- REVOKES nothing. Future migrations that create tables must include
-- their own explicit grants (new projects will not add any for them).
--
-- ROLLBACK: revoke the exact grants below, e.g.
--   revoke select, insert, update on public.<table> from authenticated;
--   revoke select, insert, update on public.merchant_upload_tickets from service_role;
--   revoke select on public.profiles from service_role;
--   revoke usage on public.case_number_seq, public.contract_number_seq,
--     public.invoice_number_seq, public.note_number_seq from authenticated;
-- (On production, rolling back would remove privileges the old defaults
-- granted — do not run the rollback there.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- authenticated — SELECT (the signed-in app's direct reads, including
-- PostgREST-embedded joins)
-- ---------------------------------------------------------------------
grant select on public.contract_receipt_photos         to authenticated;
grant select on public.damage_cases                    to authenticated;
grant select on public.damage_evidence                 to authenticated;
grant select on public.dispute_events                  to authenticated;
grant select on public.dispute_proposal_responses      to authenticated;
grant select on public.dispute_settlement_proposals    to authenticated;
grant select on public.merchant_activities             to authenticated;
grant select on public.merchant_application_activities to authenticated;
grant select on public.merchant_application_branches   to authenticated;
grant select on public.merchant_applications           to authenticated;
grant select on public.merchant_branches               to authenticated;
grant select on public.merchant_documents              to authenticated;
grant select on public.merchants                       to authenticated;
grant select on public.notifications                   to authenticated;
grant select on public.profiles                        to authenticated;
grant select on public.promissory_notes                to authenticated;
grant select on public.push_device_tokens              to authenticated;
grant select on public.rental_contracts                to authenticated;
grant select on public.rental_eligibility              to authenticated;
grant select on public.rental_invoice_items            to authenticated;
grant select on public.rental_invoices                 to authenticated;

-- ---------------------------------------------------------------------
-- authenticated — INSERT (direct creates; RLS WITH CHECK gates rows)
-- ---------------------------------------------------------------------
grant insert on public.damage_cases        to authenticated;
grant insert on public.damage_evidence     to authenticated;
grant insert on public.merchant_applications to authenticated;
grant insert on public.rental_eligibility  to authenticated;  -- upsert
grant insert on public.rental_invoice_items to authenticated;
grant insert on public.rental_invoices     to authenticated;

-- ---------------------------------------------------------------------
-- authenticated — UPDATE (direct edits; RLS + guard triggers gate rows
-- and privileged columns)
-- ---------------------------------------------------------------------
grant update on public.merchant_applications to authenticated;
grant update on public.notifications         to authenticated;
grant update on public.profiles              to authenticated;
grant update on public.rental_eligibility    to authenticated;  -- upsert

-- ---------------------------------------------------------------------
-- authenticated — sequence USAGE (nextval inside the four non-SECURITY-
-- DEFINER numbering RPCs the app calls; no column default uses these)
-- ---------------------------------------------------------------------
grant usage on sequence public.case_number_seq     to authenticated;
grant usage on sequence public.contract_number_seq to authenticated;
grant usage on sequence public.invoice_number_seq  to authenticated;
grant usage on sequence public.note_number_seq     to authenticated;

-- ---------------------------------------------------------------------
-- service_role — exactly what the Edge Functions do via PostgREST
-- ---------------------------------------------------------------------
-- merchant-doc-upload: rate-limit count (select), ticket create
-- (insert), replaceReceipt invalidation (update). Finalization happens
-- through SECURITY DEFINER RPCs, so no DELETE here.
grant select, insert, update on public.merchant_upload_tickets to service_role;
-- otp-send: customer profile lookup before SMS dispatch.
grant select on public.profiles to service_role;
