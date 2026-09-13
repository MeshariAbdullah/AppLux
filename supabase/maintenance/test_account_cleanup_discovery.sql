-- =====================================================================
-- TEST-ACCOUNT DISCOVERY (READ-ONLY) — saud@lend.sa / 0539000253
-- =====================================================================
-- Finds every row related to the test identifiers across the CURRENT
-- schema (all tables from the migration chain through 20260502130300).
-- Contains ONLY SELECTs — safe to run anywhere, changes nothing.
--
-- Identifier variants covered:
--   email  : saud@lend.sa (case-insensitive)
--   mobile : 0539000253, 539000253 (canonical storage form),
--            +966539000253, 966539000253, 00966539000253
--
-- How rows are linked:
--   * "target users"    = auth.users by email ∪ profiles by
--     email/mobile ∪ merchant_applications applicants matched by
--     contact email/phone. Covers BOTH the customer and the merchant
--     possibility for this person.
--   * "target merchants" = merchants owned by a target user.
--   * business rows      = invoices/contracts/cases where a target
--     user is the customer OR a target merchant is the merchant side.
--
-- Run each statement (or the whole file) in the Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. The resolved identity sets — review these ids FIRST. Everything
--    the cleanup script deletes hangs off exactly these.
-- ---------------------------------------------------------------------
with mobile_variants(m) as (
  values ('0539000253'), ('539000253'), ('+966539000253'),
         ('966539000253'), ('00966539000253')
),
target_users(id, found_via) as (
  select u.id, 'auth.users.email' from auth.users u
   where lower(u.email) = 'saud@lend.sa'
  union
  select p.id, 'profiles.email/mobile' from public.profiles p
   where lower(p.email) = 'saud@lend.sa'
      or p.mobile in (select m from mobile_variants)
  union
  select a.applicant_user_id, 'merchant_applications.contact'
    from public.merchant_applications a
   where a.applicant_user_id is not null
     and (lower(a.contact_email) = 'saud@lend.sa'
          or a.contact_phone in (select m from mobile_variants))
)
select tu.id as user_id, string_agg(distinct tu.found_via, ' + ') as found_via,
       p.role, p.full_name, p.mobile, p.email
  from target_users tu
  left join public.profiles p on p.id = tu.id
 group by tu.id, p.role, p.full_name, p.mobile, p.email;

-- ---------------------------------------------------------------------
-- 1. Per-table match counts — one row per table that holds anything.
--    (Zero-count tables are listed too, so absence is visible.)
-- ---------------------------------------------------------------------
with mobile_variants(m) as (
  values ('0539000253'), ('539000253'), ('+966539000253'),
         ('966539000253'), ('00966539000253')
),
tu as (
  select u.id from auth.users u where lower(u.email) = 'saud@lend.sa'
  union
  select p.id from public.profiles p
   where lower(p.email) = 'saud@lend.sa'
      or p.mobile in (select m from mobile_variants)
  union
  select a.applicant_user_id from public.merchant_applications a
   where a.applicant_user_id is not null
     and (lower(a.contact_email) = 'saud@lend.sa'
          or a.contact_phone in (select m from mobile_variants))
),
tm as (select id from public.merchants where owner_user_id in (select id from tu)),
ta as (
  select id from public.merchant_applications
   where applicant_user_id in (select id from tu)
      or lower(contact_email) = 'saud@lend.sa'
      or contact_phone in (select m from mobile_variants)
),
ti as (
  select id from public.rental_invoices
   where customer_user_id in (select id from tu)
      or merchant_id in (select id from tm)
),
tc as (
  select id from public.rental_contracts
   where customer_user_id in (select id from tu)
      or merchant_id in (select id from tm)
      or invoice_id in (select id from ti)
),
tca as (
  select id from public.damage_cases
   where contract_id in (select id from tc)
      or customer_user_id in (select id from tu)
      or merchant_id in (select id from tm)
)
select * from (
  select 'auth.users' t, count(*) n from auth.users where lower(email) = 'saud@lend.sa'
  union all select 'profiles', count(*) from public.profiles where id in (select id from tu)
  union all select 'merchants', count(*) from public.merchants where id in (select id from tm)
  union all select 'merchant_applications', count(*) from public.merchant_applications where id in (select id from ta)
  union all select 'merchant_application_branches', count(*) from public.merchant_application_branches where application_id in (select id from ta)
  union all select 'merchant_application_activities', count(*) from public.merchant_application_activities where application_id in (select id from ta)
  union all select 'merchant_branches', count(*) from public.merchant_branches where merchant_id in (select id from tm)
  union all select 'merchant_documents', count(*) from public.merchant_documents where merchant_id in (select id from tm) or application_id in (select id from ta)
  union all select 'merchant_activities', count(*) from public.merchant_activities where merchant_id in (select id from tm)
  union all select 'merchant_upload_tickets (claimed by target app)', count(*) from public.merchant_upload_tickets where claimed_application_id in (select id from ta)
  union all select 'rental_invoices', count(*) from public.rental_invoices where id in (select id from ti)
  union all select 'rental_invoice_items', count(*) from public.rental_invoice_items where invoice_id in (select id from ti)
  union all select 'rental_contracts', count(*) from public.rental_contracts where id in (select id from tc)
  union all select 'contract_receipt_photos', count(*) from public.contract_receipt_photos where contract_id in (select id from tc) or uploaded_by in (select id from tu)
  union all select 'promissory_notes', count(*) from public.promissory_notes where contract_id in (select id from tc) or customer_user_id in (select id from tu) or merchant_id in (select id from tm)
  union all select 'damage_cases', count(*) from public.damage_cases where id in (select id from tca)
  union all select 'damage_evidence', count(*) from public.damage_evidence where case_id in (select id from tca)
  union all select 'dispute_events', count(*) from public.dispute_events where case_id in (select id from tca)
  union all select 'dispute_settlement_proposals', count(*) from public.dispute_settlement_proposals where case_id in (select id from tca)
  union all select 'dispute_proposal_responses', count(*) from public.dispute_proposal_responses where proposal_id in (select id from public.dispute_settlement_proposals where case_id in (select id from tca))
  union all select 'notifications', count(*) from public.notifications where user_id in (select id from tu) or case_id in (select id from tca) or invoice_id in (select id from ti)
  union all select 'push_jobs', count(*) from public.push_jobs where user_id in (select id from tu) or notification_id in (select id from public.notifications where user_id in (select id from tu) or case_id in (select id from tca) or invoice_id in (select id from ti))
  union all select 'push_device_tokens', count(*) from public.push_device_tokens where user_id in (select id from tu)
  union all select 'rental_eligibility', count(*) from public.rental_eligibility where user_id in (select id from tu)
  union all select 'renter_otp_challenges', count(*) from public.renter_otp_challenges where customer_user_id in (select id from tu) or created_by in (select id from tu) or mobile in (select m from mobile_variants)
  union all select 'registration_otp_challenges', count(*) from public.registration_otp_challenges where mobile in (select m from mobile_variants)
  union all select 'registration_precheck_attempts', count(*) from public.registration_precheck_attempts where mobile in (select m from mobile_variants)
) s order by n desc, t;

-- ---------------------------------------------------------------------
-- 2. OUT-OF-SCOPE references that would BLOCK deletion (manual check).
--    These are rows on OTHER people's records where the target user
--    appears as an actor/reviewer (FKs are NO ACTION / RESTRICT).
--    The cleanup script does NOT delete these on purpose — if any
--    count below is > 0, resolve them manually first (they belong to
--    unrelated business records).
-- ---------------------------------------------------------------------
with mobile_variants(m) as (
  values ('0539000253'), ('539000253'), ('+966539000253'),
         ('966539000253'), ('00966539000253')
),
tu as (
  select u.id from auth.users u where lower(u.email) = 'saud@lend.sa'
  union
  select p.id from public.profiles p
   where lower(p.email) = 'saud@lend.sa'
      or p.mobile in (select m from mobile_variants)
  union
  select a.applicant_user_id from public.merchant_applications a
   where a.applicant_user_id is not null
     and (lower(a.contact_email) = 'saud@lend.sa'
          or a.contact_phone in (select m from mobile_variants))
),
tm as (select id from public.merchants where owner_user_id in (select id from tu)),
ti as (select id from public.rental_invoices where customer_user_id in (select id from tu) or merchant_id in (select id from tm)),
tc as (select id from public.rental_contracts where customer_user_id in (select id from tu) or merchant_id in (select id from tm) or invoice_id in (select id from ti)),
tca as (select id from public.damage_cases where contract_id in (select id from tc) or customer_user_id in (select id from tu) or merchant_id in (select id from tm))
select * from (
  select 'dispute_events.actor on OTHER cases' t, count(*) n from public.dispute_events
    where actor_user_id in (select id from tu) and case_id not in (select id from tca)
  union all select 'damage_evidence.uploader on OTHER cases', count(*) from public.damage_evidence
    where uploaded_by_user_id in (select id from tu) and case_id not in (select id from tca)
  union all select 'proposals by target on OTHER cases', count(*) from public.dispute_settlement_proposals
    where proposed_by_user_id in (select id from tu) and case_id not in (select id from tca)
  union all select 'proposal responses by target on OTHER cases', count(*) from public.dispute_proposal_responses r
    where r.responded_by_user_id in (select id from tu)
      and r.proposal_id not in (select id from public.dispute_settlement_proposals where case_id in (select id from tca))
  union all select 'damage_cases raised/resolved by target, not theirs', count(*) from public.damage_cases
    where (raised_by_user_id in (select id from tu) or resolved_by_user_id in (select id from tu))
      and id not in (select id from tca)
  union all select 'receipt photos by target on OTHER contracts', count(*) from public.contract_receipt_photos
    where uploaded_by in (select id from tu) and contract_id not in (select id from tc)
  union all select 'admin trails: applications decided_by target', count(*) from public.merchant_applications
    where decided_by in (select id from tu) and id not in (select id from public.merchant_applications where applicant_user_id in (select id from tu) or lower(contact_email) = 'saud@lend.sa' or contact_phone in (select m from mobile_variants))
  union all select 'admin trails: documents reviewed_by target', count(*) from public.merchant_documents
    where reviewed_by in (select id from tu) and coalesce(merchant_id, '00000000-0000-0000-0000-000000000000') not in (select id from tm)
  union all select 'admin trails: merchants approved_by target', count(*) from public.merchants
    where approved_by in (select id from tu) and id not in (select id from tm)
  union all select 'admin trails: eligibility assigned_by target', count(*) from public.rental_eligibility
    where assigned_by in (select id from tu) and user_id not in (select id from tu)
  union all select 'OTP challenges STARTED by target merchant for OTHER customers', count(*) from public.renter_otp_challenges
    where created_by in (select id from tu) and coalesce(customer_user_id, '00000000-0000-0000-0000-000000000000') not in (select id from tu)
) s where n > 0;

-- ---------------------------------------------------------------------
-- 3. Row-level detail — the actual ids/references the cleanup will
--    touch. Eyeball these before running the cleanup script.
-- ---------------------------------------------------------------------
with mobile_variants(m) as (
  values ('0539000253'), ('539000253'), ('+966539000253'),
         ('966539000253'), ('00966539000253')
),
tu as (
  select u.id from auth.users u where lower(u.email) = 'saud@lend.sa'
  union
  select p.id from public.profiles p
   where lower(p.email) = 'saud@lend.sa'
      or p.mobile in (select m from mobile_variants)
  union
  select a.applicant_user_id from public.merchant_applications a
   where a.applicant_user_id is not null
     and (lower(a.contact_email) = 'saud@lend.sa'
          or a.contact_phone in (select m from mobile_variants))
),
tm as (select id from public.merchants where owner_user_id in (select id from tu))
select 'merchants' as kind, m.id::text as id, m.company_name as ref, m.status::text as detail
  from public.merchants m where m.id in (select id from tm)
union all
select 'merchant_applications', a.id::text, a.company_name, a.status::text
  from public.merchant_applications a
 where a.applicant_user_id in (select id from tu)
    or lower(a.contact_email) = 'saud@lend.sa'
    or a.contact_phone in (select m from mobile_variants)
union all
select 'rental_invoices', i.id::text, i.invoice_number, i.status::text
  from public.rental_invoices i
 where i.customer_user_id in (select id from tu) or i.merchant_id in (select id from tm)
union all
select 'rental_contracts', c.id::text, c.contract_number, c.status::text
  from public.rental_contracts c
 where c.customer_user_id in (select id from tu) or c.merchant_id in (select id from tm)
    or c.invoice_id in (select id from public.rental_invoices where customer_user_id in (select id from tu) or merchant_id in (select id from tm))
union all
select 'damage_cases', d.id::text, d.case_number, d.status::text
  from public.damage_cases d
 where d.customer_user_id in (select id from tu) or d.merchant_id in (select id from tm)
    or d.contract_id in (select id from public.rental_contracts where customer_user_id in (select id from tu) or merchant_id in (select id from tm))
order by kind, ref;
