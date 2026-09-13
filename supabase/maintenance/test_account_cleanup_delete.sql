-- =====================================================================
-- TEST-ACCOUNT CLEANUP (DELETES) — saud@lend.sa / 0539000253
-- =====================================================================
-- Deletes every row related to the test identifiers, child tables
-- first, in explicit dependency order (nothing is left to ON DELETE
-- CASCADE, even where a cascade exists — every table is named).
--
-- RUN ORDER:
--   0) Run test_account_cleanup_discovery.sql first and review:
--      - section 0: the resolved user ids must be ONLY the test user;
--      - section 2: every "blocker" count must be 0 (rows where the
--        test user acted on OTHER people's records are NOT deleted
--        here — the transaction will fail safely on them);
--      - section 3: the listed invoices/contracts/cases are all test
--        data you intend to lose.
--   1) DRY RUN: run STEP 1 with the final COMMIT swapped for ROLLBACK
--      (see the marked line) — you get the before/after counts and
--      the database is untouched.
--   2) Run STEP 1 with COMMIT.
--   3) STEP 2 (auth.users) is a SEPARATE transaction — read its
--      warning, then run it deliberately.
--
-- Scope guarantee: every DELETE filters through the id sets resolved
-- in step (a) from the exact identifiers below — no pattern matching,
-- no unrelated rows.
--   email  : saud@lend.sa (case-insensitive equality)
--   mobile : 0539000253 / 539000253 / +966539000253 / 966539000253 /
--            00966539000253 (exact IN-list)
-- =====================================================================

-- =====================================================================
-- STEP 1 — business data, notifications/push, profile
-- =====================================================================
begin;

-- (a) Resolve the identity sets ONCE into temp tables (dropped at
--     commit/rollback). All deletes below join through these.
create temp table tmp_mobiles (m text primary key) on commit drop;
insert into tmp_mobiles values
  ('0539000253'), ('539000253'), ('+966539000253'),
  ('966539000253'), ('00966539000253');

create temp table tmp_users on commit drop as
  select u.id from auth.users u where lower(u.email) = 'saud@lend.sa'
  union
  select p.id from public.profiles p
   where lower(p.email) = 'saud@lend.sa'
      or p.mobile in (select m from tmp_mobiles)
  union
  select a.applicant_user_id from public.merchant_applications a
   where a.applicant_user_id is not null
     and (lower(a.contact_email) = 'saud@lend.sa'
          or a.contact_phone in (select m from tmp_mobiles));

create temp table tmp_merchants on commit drop as
  select id from public.merchants
   where owner_user_id in (select id from tmp_users);

create temp table tmp_apps on commit drop as
  select id from public.merchant_applications
   where applicant_user_id in (select id from tmp_users)
      or lower(contact_email) = 'saud@lend.sa'
      or contact_phone in (select m from tmp_mobiles);

create temp table tmp_invoices on commit drop as
  select id from public.rental_invoices
   where customer_user_id in (select id from tmp_users)
      or merchant_id in (select id from tmp_merchants);

create temp table tmp_contracts on commit drop as
  select id from public.rental_contracts
   where customer_user_id in (select id from tmp_users)
      or merchant_id in (select id from tmp_merchants)
      or invoice_id in (select id from tmp_invoices);

create temp table tmp_cases on commit drop as
  select id from public.damage_cases
   where contract_id in (select id from tmp_contracts)
      or customer_user_id in (select id from tmp_users)
      or merchant_id in (select id from tmp_merchants);

-- Notifications tied to the target user OR to target cases/invoices
-- (case/invoice notifications also sit on the COUNTERPARTY's account;
-- they reference rows being deleted, so they go too — the FK would
-- cascade them anyway; here it is explicit).
create temp table tmp_notifications on commit drop as
  select id from public.notifications
   where user_id in (select id from tmp_users)
      or case_id in (select id from tmp_cases)
      or invoice_id in (select id from tmp_invoices);

-- (b) SAFETY GATE: abort before touching anything if the target user
--     appears as an actor on records OUTSIDE this scope (NO ACTION /
--     RESTRICT FKs would abort mid-way otherwise; this fails first,
--     with a clear message — see discovery section 2 for the rows).
do $$
declare v_blockers int;
begin
  select
    (select count(*) from public.dispute_events
      where actor_user_id in (select id from tmp_users)
        and case_id not in (select id from tmp_cases))
  + (select count(*) from public.damage_evidence
      where uploaded_by_user_id in (select id from tmp_users)
        and case_id not in (select id from tmp_cases))
  + (select count(*) from public.dispute_settlement_proposals
      where proposed_by_user_id in (select id from tmp_users)
        and case_id not in (select id from tmp_cases))
  + (select count(*) from public.dispute_proposal_responses
      where responded_by_user_id in (select id from tmp_users)
        and proposal_id not in (select id from public.dispute_settlement_proposals
                                 where case_id in (select id from tmp_cases)))
  + (select count(*) from public.damage_cases
      where (raised_by_user_id in (select id from tmp_users)
             or resolved_by_user_id in (select id from tmp_users))
        and id not in (select id from tmp_cases))
  + (select count(*) from public.contract_receipt_photos
      where uploaded_by in (select id from tmp_users)
        and contract_id not in (select id from tmp_contracts))
  + (select count(*) from public.merchant_applications
      where decided_by in (select id from tmp_users)
        and id not in (select id from tmp_apps))
  + (select count(*) from public.merchant_documents
      where reviewed_by in (select id from tmp_users)
        and coalesce(merchant_id, '00000000-0000-0000-0000-000000000000')
            not in (select id from tmp_merchants)
        and coalesce(application_id, '00000000-0000-0000-0000-000000000000')
            not in (select id from tmp_apps))
  + (select count(*) from public.merchants
      where approved_by in (select id from tmp_users)
        and id not in (select id from tmp_merchants))
  + (select count(*) from public.rental_eligibility
      where assigned_by in (select id from tmp_users)
        and user_id not in (select id from tmp_users))
  + (select count(*) from public.renter_otp_challenges
      where created_by in (select id from tmp_users)
        and coalesce(customer_user_id, '00000000-0000-0000-0000-000000000000')
            not in (select id from tmp_users))
  into v_blockers;
  if v_blockers > 0 then
    raise exception
      'ABORTING: % row(s) reference the target user on UNRELATED records '
      '(see discovery script, section 2). Resolve those manually first — '
      'this script never deletes other accounts'' data.', v_blockers;
  end if;
end $$;

-- (c) COUNTS BEFORE — keep this output next to the after-counts.
select 'BEFORE' phase, t, n from (
  select 'profiles' t, count(*) n from public.profiles where id in (select id from tmp_users)
  union all select 'merchants', count(*) from public.merchants where id in (select id from tmp_merchants)
  union all select 'merchant_applications', count(*) from public.merchant_applications where id in (select id from tmp_apps)
  union all select 'merchant_application_branches', count(*) from public.merchant_application_branches where application_id in (select id from tmp_apps)
  union all select 'merchant_application_activities', count(*) from public.merchant_application_activities where application_id in (select id from tmp_apps)
  union all select 'merchant_branches', count(*) from public.merchant_branches where merchant_id in (select id from tmp_merchants)
  union all select 'merchant_documents', count(*) from public.merchant_documents where merchant_id in (select id from tmp_merchants) or application_id in (select id from tmp_apps)
  union all select 'merchant_activities', count(*) from public.merchant_activities where merchant_id in (select id from tmp_merchants)
  union all select 'merchant_upload_tickets', count(*) from public.merchant_upload_tickets where claimed_application_id in (select id from tmp_apps)
  union all select 'rental_invoices', count(*) from public.rental_invoices where id in (select id from tmp_invoices)
  union all select 'rental_invoice_items', count(*) from public.rental_invoice_items where invoice_id in (select id from tmp_invoices)
  union all select 'rental_contracts', count(*) from public.rental_contracts where id in (select id from tmp_contracts)
  union all select 'contract_receipt_photos', count(*) from public.contract_receipt_photos where contract_id in (select id from tmp_contracts) or uploaded_by in (select id from tmp_users)
  union all select 'promissory_notes', count(*) from public.promissory_notes where contract_id in (select id from tmp_contracts) or customer_user_id in (select id from tmp_users) or merchant_id in (select id from tmp_merchants)
  union all select 'damage_cases', count(*) from public.damage_cases where id in (select id from tmp_cases)
  union all select 'damage_evidence', count(*) from public.damage_evidence where case_id in (select id from tmp_cases)
  union all select 'dispute_events', count(*) from public.dispute_events where case_id in (select id from tmp_cases)
  union all select 'dispute_settlement_proposals', count(*) from public.dispute_settlement_proposals where case_id in (select id from tmp_cases)
  union all select 'dispute_proposal_responses', count(*) from public.dispute_proposal_responses where proposal_id in (select id from public.dispute_settlement_proposals where case_id in (select id from tmp_cases))
  union all select 'notifications', count(*) from public.notifications where id in (select id from tmp_notifications)
  union all select 'push_jobs', count(*) from public.push_jobs where user_id in (select id from tmp_users) or notification_id in (select id from tmp_notifications)
  union all select 'push_device_tokens', count(*) from public.push_device_tokens where user_id in (select id from tmp_users)
  union all select 'rental_eligibility', count(*) from public.rental_eligibility where user_id in (select id from tmp_users)
  union all select 'renter_otp_challenges', count(*) from public.renter_otp_challenges where customer_user_id in (select id from tmp_users) or created_by in (select id from tmp_users) or mobile in (select m from tmp_mobiles)
  union all select 'registration_otp_challenges', count(*) from public.registration_otp_challenges where mobile in (select m from tmp_mobiles)
  union all select 'registration_precheck_attempts', count(*) from public.registration_precheck_attempts where mobile in (select m from tmp_mobiles)
) s order by t;

-- (d) DELETES — children first. Every statement filters through the
--     temp id sets only.

-- d1. Dispute tree under the target cases (deepest first).
delete from public.dispute_proposal_responses
 where proposal_id in (select id from public.dispute_settlement_proposals
                        where case_id in (select id from tmp_cases));
delete from public.dispute_settlement_proposals
 where case_id in (select id from tmp_cases);
delete from public.dispute_events
 where case_id in (select id from tmp_cases);
delete from public.damage_evidence
 where case_id in (select id from tmp_cases);

-- d2. Push/notification rows about the target user, cases, invoices —
--     explicitly before their parents (FKs would cascade; we don't rely
--     on it).
delete from public.push_jobs
 where user_id in (select id from tmp_users)
    or notification_id in (select id from tmp_notifications);
delete from public.notifications
 where id in (select id from tmp_notifications);

-- d3. Damage cases, then the rental chain under the target
--     contracts/invoices.
delete from public.damage_cases where id in (select id from tmp_cases);
delete from public.contract_receipt_photos
 where contract_id in (select id from tmp_contracts)
    or uploaded_by in (select id from tmp_users);
delete from public.promissory_notes
 where contract_id in (select id from tmp_contracts)
    or customer_user_id in (select id from tmp_users)
    or merchant_id in (select id from tmp_merchants);
delete from public.rental_contracts where id in (select id from tmp_contracts);

-- d4. Renter-session OTP challenges reference invoices
--     (used_invoice_id) and the user — clear before the invoices go.
delete from public.renter_otp_challenges
 where customer_user_id in (select id from tmp_users)
    or created_by in (select id from tmp_users)
    or mobile in (select m from tmp_mobiles);

delete from public.rental_invoice_items
 where invoice_id in (select id from tmp_invoices);
delete from public.rental_invoices where id in (select id from tmp_invoices);

-- d5. Remaining per-user rows.
delete from public.push_device_tokens
 where user_id in (select id from tmp_users);
delete from public.rental_eligibility
 where user_id in (select id from tmp_users);

-- d6. Merchant side: children of merchants, then merchants, then the
--     application tree (merchants.application_id is SET NULL, but the
--     merchant rows are already gone by then anyway).
delete from public.merchant_activities
 where merchant_id in (select id from tmp_merchants);
delete from public.merchant_branches
 where merchant_id in (select id from tmp_merchants);
delete from public.merchant_documents
 where merchant_id in (select id from tmp_merchants)
    or application_id in (select id from tmp_apps);
delete from public.merchants where id in (select id from tmp_merchants);
delete from public.merchant_application_activities
 where application_id in (select id from tmp_apps);
delete from public.merchant_application_branches
 where application_id in (select id from tmp_apps);
delete from public.merchant_upload_tickets
 where claimed_application_id in (select id from tmp_apps);
delete from public.merchant_applications where id in (select id from tmp_apps);

-- d7. Signup OTP hygiene rows keyed by the mobile only (canonical
--     storage is 539000253; all variants covered).
delete from public.registration_otp_challenges
 where mobile in (select m from tmp_mobiles);
delete from public.registration_precheck_attempts
 where mobile in (select m from tmp_mobiles);

-- d8. The profile row(s). Everything that referenced them is gone; a
--     surviving reference makes this fail and roll the whole
--     transaction back — that is the safety net working.
delete from public.profiles where id in (select id from tmp_users);

-- (e) COUNTS AFTER — every row must be 0.
select 'AFTER' phase, t, n from (
  select 'profiles' t, count(*) n from public.profiles where id in (select id from tmp_users)
  union all select 'merchants', count(*) from public.merchants where id in (select id from tmp_merchants)
  union all select 'merchant_applications', count(*) from public.merchant_applications where id in (select id from tmp_apps)
  union all select 'merchant_application_branches', count(*) from public.merchant_application_branches where application_id in (select id from tmp_apps)
  union all select 'merchant_application_activities', count(*) from public.merchant_application_activities where application_id in (select id from tmp_apps)
  union all select 'merchant_branches', count(*) from public.merchant_branches where merchant_id in (select id from tmp_merchants)
  union all select 'merchant_documents', count(*) from public.merchant_documents where merchant_id in (select id from tmp_merchants) or application_id in (select id from tmp_apps)
  union all select 'merchant_activities', count(*) from public.merchant_activities where merchant_id in (select id from tmp_merchants)
  union all select 'merchant_upload_tickets', count(*) from public.merchant_upload_tickets where claimed_application_id in (select id from tmp_apps)
  union all select 'rental_invoices', count(*) from public.rental_invoices where id in (select id from tmp_invoices)
  union all select 'rental_invoice_items', count(*) from public.rental_invoice_items where invoice_id in (select id from tmp_invoices)
  union all select 'rental_contracts', count(*) from public.rental_contracts where id in (select id from tmp_contracts)
  union all select 'contract_receipt_photos', count(*) from public.contract_receipt_photos where contract_id in (select id from tmp_contracts) or uploaded_by in (select id from tmp_users)
  union all select 'promissory_notes', count(*) from public.promissory_notes where contract_id in (select id from tmp_contracts) or customer_user_id in (select id from tmp_users) or merchant_id in (select id from tmp_merchants)
  union all select 'damage_cases', count(*) from public.damage_cases where id in (select id from tmp_cases)
  union all select 'damage_evidence', count(*) from public.damage_evidence where case_id in (select id from tmp_cases)
  union all select 'dispute_events', count(*) from public.dispute_events where case_id in (select id from tmp_cases)
  union all select 'dispute_settlement_proposals', count(*) from public.dispute_settlement_proposals where case_id in (select id from tmp_cases)
  union all select 'dispute_proposal_responses', count(*) from public.dispute_proposal_responses where proposal_id in (select id from public.dispute_settlement_proposals where case_id in (select id from tmp_cases))
  union all select 'notifications', count(*) from public.notifications where id in (select id from tmp_notifications)
  union all select 'push_jobs', count(*) from public.push_jobs where user_id in (select id from tmp_users) or notification_id in (select id from tmp_notifications)
  union all select 'push_device_tokens', count(*) from public.push_device_tokens where user_id in (select id from tmp_users)
  union all select 'rental_eligibility', count(*) from public.rental_eligibility where user_id in (select id from tmp_users)
  union all select 'renter_otp_challenges', count(*) from public.renter_otp_challenges where customer_user_id in (select id from tmp_users) or created_by in (select id from tmp_users) or mobile in (select m from tmp_mobiles)
  union all select 'registration_otp_challenges', count(*) from public.registration_otp_challenges where mobile in (select m from tmp_mobiles)
  union all select 'registration_precheck_attempts', count(*) from public.registration_precheck_attempts where mobile in (select m from tmp_mobiles)
) s order by t;

-- =====================================================================
-- DRY RUN: swap COMMIT for ROLLBACK on the next line to test — you get
-- the full BEFORE/AFTER output and nothing is persisted.
-- =====================================================================
commit;
-- rollback;

-- =====================================================================
-- STEP 2 — auth.users (SEPARATE, DELIBERATE)
-- =====================================================================
-- ⚠️  WARNING: this deletes the LOGIN itself. The account
--     saud@lend.sa can no longer sign in anywhere (customer or
--     merchant app), its refresh tokens die, and this cannot be
--     undone. Run it ONLY after STEP 1 committed cleanly.
--     (profiles.id → auth.users is ON DELETE CASCADE, but the profile
--     is already gone after STEP 1 — this removes just the auth row.)
-- =====================================================================
begin;

select 'BEFORE auth.users' phase, count(*) n
  from auth.users where lower(email) = 'saud@lend.sa';

delete from auth.users where lower(email) = 'saud@lend.sa';

select 'AFTER auth.users' phase, count(*) n
  from auth.users where lower(email) = 'saud@lend.sa';

-- DRY RUN: swap COMMIT for ROLLBACK here too, same as STEP 1.
commit;
-- rollback;
