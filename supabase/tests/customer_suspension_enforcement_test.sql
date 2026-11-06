-- =====================================================================
-- Customer suspension enforcement — regression (20260502130800)
-- =====================================================================
-- Runs on the hosted-faithful local replica (pgcrypto in `extensions`)
-- AFTER the full migration chain incl. 20260502130800. One transaction,
-- ROLLBACK at the end — leaves no rows behind.
--
-- Actor simulation: set_config('request.jwt.claim.sub', …) drives
-- auth.uid(). Where the real client role matters (RLS, the P0100
-- privileged-column guard, which only fires for anon/authenticated)
-- the block switches to `set local role authenticated` and resets.
--
-- Scenario map (Product Owner regression list):
--   S0  baseline — active customer: lookup, OTP, issuance, acceptance,
--       activation all work; existing obligations are created
--   S0b deletion-grace suspension (request/cancel_account_deletion)
--   S1  suspension: self-change still P0100; admin suspends
--   S2  merchant-initiated flows rejected: lookup, OTP start (no side
--       effects), direct invoice insert, draft→issued, privileged
--       insert (bypass-proof); issuance to an ACTIVE customer still ok
--   S3  customer-side new obligations rejected: accept, receipt
--       confirmation, handover, activation RPC, promissory-note
--       activation, direct contract insert / status flip
--   S4  still allowed: reject offer; read access under RLS; objection,
--       evidence, settlement response on an existing dispute; return
--       declaration + merchant confirmation; non-handover request
--   S5  no unintended mutation: pending rows unchanged, no closure, no
--       eligibility release, no audit rows from blocked attempts
--   S6  reactivation restores every capability
--   S7  authorization intact: non-admin cannot change another status,
--       customers cannot look up renters
--   S8  structural guards: helper ACL/volatility/FOR SHARE, trigger
--       binding + firing order, P0100 trigger, RLS/grant surface
-- =====================================================================
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u::text, false) $$;
create or replace function pg_temp.as_anon() returns void language sql as
$$ select set_config('request.jwt.claim.sub', '', false) $$;

create or replace function pg_temp.expect_error(
  p_sql text, p_errcode text, p_label text
) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: expected error % but call succeeded', p_label, p_errcode;
  exception
    when others then
      if sqlstate <> p_errcode then
        raise exception 'FAIL %: expected % got % (%)', p_label, p_errcode, sqlstate, sqlerrm;
      end if;
  end;
  raise notice 'ok: % (rejected with %)', p_label, p_errcode;
end $$;

-- ---------------------------------------------------------------------
-- Fixture: merchant owner + merchant, admin, customers C1 (suspended
-- during the suite) and C2 (control / deletion-grace)
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000','eeee1111-0000-4000-8000-0000000000a1','authenticated','authenticated','su+owner@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','eeee1111-0000-4000-8000-0000000000a9','authenticated','authenticated','su+admin@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','eeee2222-0000-4000-8000-0000000000c1','authenticated','authenticated','su+c1@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','eeee2222-0000-4000-8000-0000000000c2','authenticated','authenticated','su+c2@lend.test',now(),now());

update public.profiles set role='merchant', account_status='active', full_name='SU Owner', mobile='500000071'
 where id='eeee1111-0000-4000-8000-0000000000a1';
update public.profiles set role='admin', account_status='active', full_name='SU Admin', mobile='500000079'
 where id='eeee1111-0000-4000-8000-0000000000a9';
update public.profiles set role='customer', account_status='active', full_name='SU Customer One', mobile='551110071', national_id='1011111171'
 where id='eeee2222-0000-4000-8000-0000000000c1';
update public.profiles set role='customer', account_status='active', full_name='SU Customer Two', mobile='551110072', national_id='1011111172'
 where id='eeee2222-0000-4000-8000-0000000000c2';

insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status) values
 ('eeee3333-0000-4000-8000-0000000000a1','eeee1111-0000-4000-8000-0000000000a1','SU Co','CR-1010000071','{"ar":"متجر الإيقاف","en":"SU Store"}','dress','الرياض','active');

-- privileged offer factory (the P0195 OTP gate exempts auth.uid() IS
-- NULL writers by design; the suspension gate does NOT — S2 proves it)
create or replace function pg_temp.mk_invoice(
  p_n int, p_customer uuid, p_status public.invoice_status default 'issued',
  p_value numeric default 1000
) returns uuid language plpgsql as $$
declare v uuid; v_nid text;
begin
  perform pg_temp.as_anon();
  select national_id into v_nid from public.profiles where id = p_customer;
  insert into public.rental_invoices
    (invoice_number, merchant_id, customer_user_id, status,
     subtotal_amount, tax_amount, total_amount, original_item_value,
     lessee_national_id, expires_at)
  values
    ('INV-SU-'||lpad(p_n::text, 4, '0'), 'eeee3333-0000-4000-8000-0000000000a1', p_customer, p_status,
     300, 0, 300, p_value, v_nid, now() + interval '1 hour')
  returning id into v;
  return v;
end $$;

-- accept + photo + confirm (stops BEFORE activation)
create or replace function pg_temp.mk_confirmed_pending(p_n int, p_customer uuid)
returns uuid language plpgsql as $$
declare v_inv uuid; v_con uuid;
begin
  v_inv := pg_temp.mk_invoice(p_n, p_customer);
  perform pg_temp.as_user(p_customer);
  v_con := public.accept_rental_invoice(v_inv);
  insert into public.contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (v_con, p_customer, 'receipts/'||v_con||'/su.png');
  perform public.confirm_contract_receipt_photos(v_con);
  return v_con;
end $$;

-- the real customer path → ACTIVE rental
create or replace function pg_temp.mk_active_contract(p_n int, p_customer uuid)
returns uuid language plpgsql as $$
declare v_con uuid;
begin
  v_con := pg_temp.mk_confirmed_pending(p_n, p_customer);
  perform public.activate_rental_without_payment_and_note(v_con);
  return v_con;
end $$;

create or replace function pg_temp.used_of(p_customer uuid) returns numeric language sql as
$$ select used_amount from public.rental_eligibility where user_id = p_customer $$;

create or replace function pg_temp.status_of(p_customer uuid) returns text language sql as
$$ select account_status::text from public.profiles where id = p_customer $$;

-- =====================================================================
-- S0. Baseline — ACTIVE customer: every path works, obligations exist
-- =====================================================================
do $$
declare v_n int; v_con_a uuid; v_con_b uuid; v_con_p uuid; v_con_p2 uuid; v_con_p3 uuid;
        v_off_r uuid; v_off_x uuid; v_case uuid;
begin
  -- merchant entry points
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  select count(*) into v_n from public.lookup_renter_by_mobile('551110071');
  if v_n <> 1 then raise exception 'FAIL S0: lookup must find the active customer'; end if;
  perform public.merchant_start_renter_otp('551110071', 'inapp');
  if not exists (select 1 from public.renter_otp_challenges
                  where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1') then
    raise exception 'FAIL S0: OTP challenge must be created for an active customer';
  end if;

  -- existing obligations created BEFORE the suspension
  v_con_a  := pg_temp.mk_active_contract(1, 'eeee2222-0000-4000-8000-0000000000c1');   -- return declared later
  v_con_b  := pg_temp.mk_active_contract(2, 'eeee2222-0000-4000-8000-0000000000c1');   -- dispute later
  v_con_p2 := pg_temp.mk_confirmed_pending(3, 'eeee2222-0000-4000-8000-0000000000c1'); -- photos confirmed, not activated
  v_off_r  := pg_temp.mk_invoice(4, 'eeee2222-0000-4000-8000-0000000000c1');           -- accepted below, no photos
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  v_con_p  := public.accept_rental_invoice(v_off_r);                                   -- accepted, no photos
  v_off_r  := pg_temp.mk_invoice(7, 'eeee2222-0000-4000-8000-0000000000c1');
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  v_con_p3 := public.accept_rental_invoice(v_off_r);                                   -- accepted, never handed over
  v_off_r  := pg_temp.mk_invoice(5, 'eeee2222-0000-4000-8000-0000000000c1');           -- to reject while suspended
  v_off_x  := pg_temp.mk_invoice(6, 'eeee2222-0000-4000-8000-0000000000c1');           -- to accept after reactivation

  if pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') <> 2000 then
    raise exception 'FAIL S0: two activations must commit 2000 (got %)', pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1');
  end if;

  -- merchant files a damage claim on CON_B (open dispute = existing obligation)
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  insert into public.damage_cases
    (case_number, contract_id, customer_user_id, merchant_id, severity, claim_amount, description, raised_by_user_id)
  values ('DC-SU-0001', v_con_b, 'eeee2222-0000-4000-8000-0000000000c1',
          'eeee3333-0000-4000-8000-0000000000a1', 'partial', 400, 'اختبار الإيقاف — بيانات وهمية',
          'eeee1111-0000-4000-8000-0000000000a1')
  returning id into v_case;

  perform set_config('app.su_con_a',  v_con_a::text,  false);
  perform set_config('app.su_con_b',  v_con_b::text,  false);
  perform set_config('app.su_con_p',  v_con_p::text,  false);
  perform set_config('app.su_con_p2', v_con_p2::text, false);
  perform set_config('app.su_con_p3', v_con_p3::text, false);
  perform set_config('app.su_off_r',  v_off_r::text,  false);
  perform set_config('app.su_off_x',  v_off_x::text,  false);
  perform set_config('app.su_case',   v_case::text,   false);
  raise notice 'ok: S0 baseline — active customer fully functional, obligations in place (used=2000)';
end $$;

-- =====================================================================
-- S0b. Self-serve deletion grace = suspended: same rule, reversible
-- =====================================================================
do $$
declare v_n int;
begin
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c2');
  perform public.request_account_deletion();
  if pg_temp.status_of('eeee2222-0000-4000-8000-0000000000c2') <> 'suspended' then
    raise exception 'FAIL S0b: deletion request must suspend the account';
  end if;
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    'select * from public.lookup_renter_by_mobile(''551110072'')', 'P0101',
    'S0b lookup of a customer in the deletion grace window');
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c2');
  perform public.cancel_account_deletion();
  if pg_temp.status_of('eeee2222-0000-4000-8000-0000000000c2') <> 'active' then
    raise exception 'FAIL S0b: cancelling the deletion must restore active';
  end if;
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  select count(*) into v_n from public.lookup_renter_by_mobile('551110072');
  if v_n <> 1 then raise exception 'FAIL S0b: lookup must work again after cancellation'; end if;
  raise notice 'ok: S0b deletion-grace suspension blocks and cancellation restores';
end $$;

-- =====================================================================
-- S1. Suspension — self-change still P0100 (role-escalation guard
--     intact); the admin suspends C1 through the real client role
-- =====================================================================
do $$
begin
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  set local role authenticated;
  perform pg_temp.expect_error(
    'update public.profiles set account_status = ''suspended'' where id = ''eeee2222-0000-4000-8000-0000000000c1''',
    'P0100', 'S1 customer cannot change own account_status');
  perform pg_temp.expect_error(
    'update public.profiles set role = ''admin'' where id = ''eeee2222-0000-4000-8000-0000000000c1''',
    'P0100', 'S1 customer cannot self-escalate role');
  reset role;

  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a9');
  set local role authenticated;
  update public.profiles set account_status = 'suspended'
   where id = 'eeee2222-0000-4000-8000-0000000000c1';
  reset role;
  if pg_temp.status_of('eeee2222-0000-4000-8000-0000000000c1') <> 'suspended' then
    raise exception 'FAIL S1: admin suspension did not persist';
  end if;
  raise notice 'ok: S1 admin suspended C1 (P0100 intact for non-admins)';
end $$;

-- snapshot for the no-mutation assertions (S5)
create temp table su_snapshot as
select (select count(*) from public.contract_events
         where contract_id = current_setting('app.su_con_p2')::uuid
            or invoice_id = current_setting('app.su_off_x')::uuid) as events_n,
       (select count(*) from public.rental_contracts
         where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1') as contracts_n,
       (select count(*) from public.renter_otp_challenges
         where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1') as otp_n,
       (select count(*) from public.notifications
         where user_id = 'eeee2222-0000-4000-8000-0000000000c1' and type = 'renter_otp_ready') as otp_notif_n,
       pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') as used,
       (select updated_at from public.rental_contracts where id = current_setting('app.su_con_p2')::uuid) as con_p2_updated_at;

-- =====================================================================
-- S2. Merchant-initiated flows for the suspended customer are rejected
-- =====================================================================
do $$
declare v_draft uuid; v_n int;
begin
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    'select * from public.lookup_renter_by_mobile(''551110071'')', 'P0101',
    'S2 merchant lookup of a suspended customer');
  perform pg_temp.expect_error(
    'select public.merchant_start_renter_otp(''551110071'', ''inapp'')', 'P0101',
    'S2 merchant OTP start for a suspended customer');
  if (select count(*) from public.renter_otp_challenges where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1')
     <> (select otp_n from su_snapshot)
     or (select count(*) from public.notifications where user_id = 'eeee2222-0000-4000-8000-0000000000c1' and type = 'renter_otp_ready')
     <> (select otp_notif_n from su_snapshot) then
    raise exception 'FAIL S2: rejected OTP start must leave no challenge/notification behind';
  end if;

  -- direct offer insert as the merchant owner (the wizard path)
  perform pg_temp.expect_error(
    $q$insert into public.rental_invoices
         (invoice_number, merchant_id, customer_user_id, status, subtotal_amount, tax_amount, total_amount,
          original_item_value, lessee_national_id, expires_at)
       values ('INV-SU-0901', 'eeee3333-0000-4000-8000-0000000000a1', 'eeee2222-0000-4000-8000-0000000000c1',
               'issued', 300, 0, 300, 1000, '1011111171', now() + interval '1 hour')$q$,
    'P0101', 'S2 direct offer insert (merchant) for a suspended customer');

  -- privileged / no-session writer: the OTP gate exempts it, the suspension gate does not
  perform pg_temp.expect_error(
    'select pg_temp.mk_invoice(902, ''eeee2222-0000-4000-8000-0000000000c1'')', 'P0101',
    'S2 privileged offer insert for a suspended customer (bypass-proof)');

  -- draft rows are not exposure; promoting one to issued is
  v_draft := pg_temp.mk_invoice(903, 'eeee2222-0000-4000-8000-0000000000c1', 'draft');
  perform pg_temp.expect_error(
    format('update public.rental_invoices set status = ''issued'' where id = %L', v_draft), 'P0101',
    'S2 draft → issued for a suspended customer');
  if (select status from public.rental_invoices where id = v_draft) <> 'draft' then
    raise exception 'FAIL S2: draft must remain draft after the rejected promotion';
  end if;

  -- control: issuance to an ACTIVE customer is unaffected
  perform pg_temp.mk_invoice(904, 'eeee2222-0000-4000-8000-0000000000c2');
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  select count(*) into v_n from public.lookup_renter_by_mobile('551110072');
  if v_n <> 1 then raise exception 'FAIL S2: active customer lookup must still work'; end if;
  raise notice 'ok: S2 merchant-initiated flows rejected for the suspended customer only';
end $$;

-- =====================================================================
-- S3. Customer-side new obligations are rejected (every path)
-- =====================================================================
do $$
declare v_off_r uuid := current_setting('app.su_off_r')::uuid;
        v_con_p uuid := current_setting('app.su_con_p')::uuid;
        v_con_p2 uuid := current_setting('app.su_con_p2')::uuid;
        v_note uuid;
begin
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');

  perform pg_temp.expect_error(
    format('select public.accept_rental_invoice(%L)', v_off_r), 'P0101',
    'S3 accept offer while suspended');
  if (select status from public.rental_invoices where id = v_off_r) <> 'issued'
     or exists (select 1 from public.rental_contracts where invoice_id = v_off_r) then
    raise exception 'FAIL S3: rejected acceptance must leave the offer issued with no contract';
  end if;

  -- receipt documentation on the accepted-but-pending contract: the
  -- upload itself is evidence (allowed); confirming it advances the
  -- rental (blocked)
  insert into public.contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (v_con_p, 'eeee2222-0000-4000-8000-0000000000c1', 'receipts/'||v_con_p||'/su.png');
  perform pg_temp.expect_error(
    format('select public.confirm_contract_receipt_photos(%L)', v_con_p), 'P0101',
    'S3 confirm receipt photos while suspended');
  if (select receipt_photos_confirmed_at from public.rental_contracts where id = v_con_p) is not null then
    raise exception 'FAIL S3: receipt confirmation must not persist';
  end if;

  perform pg_temp.expect_error(
    format('select public.record_contract_handover(%L, %L)', v_con_p, 'handover/'||v_con_p||'.png'), 'P0101',
    'S3 record handover while suspended');
  if (select handover_at from public.rental_contracts where id = v_con_p) is not null then
    raise exception 'FAIL S3: handover must not persist';
  end if;

  -- activation RPC on the contract whose photos were confirmed before the suspension
  perform pg_temp.expect_error(
    format('select public.activate_rental_without_payment_and_note(%L)', v_con_p2), 'P0101',
    'S3 activate rental while suspended');

  -- promissory-note activation path
  insert into public.promissory_notes
    (reference_number, contract_id, customer_user_id, merchant_id, beneficiary_name, principal_amount, due_date, status)
  values ('PN-SU-0001', v_con_p2, 'eeee2222-0000-4000-8000-0000000000c1',
          'eeee3333-0000-4000-8000-0000000000a1', 'SU Co', 1000, current_date + 30, 'signed')
  returning id into v_note;
  perform pg_temp.expect_error(
    format('select public.verify_and_activate_rental(%L)', v_note), 'P0101',
    'S3 note-driven activation while suspended');
  if (select nafith_attested_at from public.promissory_notes where id = v_note) is not null then
    raise exception 'FAIL S3: the rejected note activation must roll back the attestation stamp';
  end if;

  -- data-level: no path (RPC or otherwise) can create/activate
  perform pg_temp.as_anon();
  perform pg_temp.expect_error(
    format('update public.rental_contracts set status = ''active'' where id = %L', v_con_p2), 'P0101',
    'S3 direct status flip to active while suspended');
  perform pg_temp.expect_error(
    format($q$insert into public.rental_contracts
             (contract_number, invoice_id, customer_user_id, merchant_id, start_date, end_date,
              rental_fee_amount, security_deposit, total_amount, status)
           values ('LND-SU0001', %L, 'eeee2222-0000-4000-8000-0000000000c1', 'eeee3333-0000-4000-8000-0000000000a1',
                   current_date, current_date + 7, 300, 0, 300, 'pending')$q$, v_off_r),
    'P0101', 'S3 direct contract insert while suspended');

  if (select status from public.rental_contracts where id = v_con_p2) <> 'pending'
     or (select status from public.rental_contracts where id = v_con_p) <> 'pending' then
    raise exception 'FAIL S3: pending contracts must remain pending';
  end if;
  raise notice 'ok: S3 every new-obligation path rejected; nothing persisted';
end $$;

-- =====================================================================
-- S4. Still allowed — view and resolve EXISTING obligations
-- =====================================================================
do $$
declare v_off_r uuid := current_setting('app.su_off_r')::uuid;
        v_con_a uuid := current_setting('app.su_con_a')::uuid;
        v_con_b uuid := current_setting('app.su_con_b')::uuid;
        v_con_p3 uuid := current_setting('app.su_con_p3')::uuid;
        v_case  uuid := current_setting('app.su_case')::uuid;
        v_n int; v_prop uuid; v_req uuid; v_reason text; v_used numeric; v_reserved numeric;
begin
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');

  -- reject a pending offer
  perform public.reject_rental_invoice(v_off_r);
  if (select status from public.rental_invoices where id = v_off_r) <> 'rejected' then
    raise exception 'FAIL S4: rejection must succeed while suspended';
  end if;

  -- read access under the real client role + RLS
  set local role authenticated;
  select count(*) into v_n from public.rental_contracts;
  if v_n < 4 then raise exception 'FAIL S4: suspended customer must still read own contracts (got %)', v_n; end if;
  select count(*) into v_n from public.rental_invoices;
  if v_n < 2 then raise exception 'FAIL S4: suspended customer must still read own offers (got %)', v_n; end if;
  select count(*) into v_n from public.damage_cases where id = v_case;
  if v_n <> 1 then raise exception 'FAIL S4: suspended customer must still read own dispute'; end if;
  select count(*) into v_n from public.profiles where id = 'eeee2222-0000-4000-8000-0000000000c1';
  if v_n <> 1 then raise exception 'FAIL S4: suspended customer must still read own profile (status notice)'; end if;
  reset role;

  -- dispute handling on the existing contract: objection, evidence,
  -- settlement response → settled; the contract stays active (D-1)
  v_used := pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1');
  perform public.customer_object_to_claim(v_case, 'القطعة سُلّمت بحالة سليمة — بيانات وهمية');
  insert into public.damage_evidence (case_id, evidence_type, storage_path, caption)
  values (v_case, 'photo', 'evidence/'||v_case||'/su.png', 'دليل العميل');
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  perform public.submit_settlement_proposal(v_case, 250, 'عرض تسوية');
  select id into v_prop from public.dispute_settlement_proposals
   where case_id = v_case order by created_at desc limit 1;
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_settlement_proposal(v_prop, true);
  if (select status::text from public.damage_cases where id = v_case) <> 'settled' then
    raise exception 'FAIL S4: suspended customer must be able to settle the dispute';
  end if;
  if (select status::text from public.rental_contracts where id = v_con_b) <> 'active'
     or pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') <> v_used then
    raise exception 'FAIL S4: settlement must leave the contract active and eligibility held';
  end if;

  -- return declaration on CON_A, confirmed by the merchant → closed,
  -- exposure of the PRE-EXISTING obligation released
  v_req := public.request_contract_closure(v_con_a, 'return_declared', now(), 'أعدت القطعة');
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  v_reason := public.confirm_contract_closure(v_req);
  if (select status::text from public.rental_contracts where id = v_con_a) <> 'ended'
     or (select closure_reason::text from public.rental_contracts where id = v_con_a) not in ('returned', 'returned_early') then
    raise exception 'FAIL S4: declared return must close CON_A (got %)', v_reason;
  end if;
  if pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') <> v_used - 1000 then
    raise exception 'FAIL S4: closing an existing obligation must release its exposure';
  end if;

  -- non-handover on the PENDING contract CON_P3 (accepted before the
  -- suspension, never handed over): declared by the suspended customer,
  -- confirmed by the merchant → closed as not handed over and its
  -- reservation released. A suspension never traps a pending rental.
  v_reserved := public.eligibility_reserved_amount('eeee2222-0000-4000-8000-0000000000c1', null);
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con_p3, 'non_handover');
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  v_reason := public.confirm_contract_closure(v_req, 'لم تُسلَّم القطعة');
  if (select status::text from public.rental_contracts where id = v_con_p3) <> 'ended'
     or (select closure_reason::text from public.rental_contracts where id = v_con_p3) <> 'not_handed_over' then
    raise exception 'FAIL S4: mutual non-handover must close CON_P3 (got %)', v_reason;
  end if;
  if public.eligibility_reserved_amount('eeee2222-0000-4000-8000-0000000000c1', null) <> v_reserved - 1000 then
    raise exception 'FAIL S4: closing the pending contract must release its reservation';
  end if;
  raise notice 'ok: S4 reject / read / dispute / return declaration / non-handover all allowed while suspended';
end $$;

-- =====================================================================
-- S5. No unintended mutation from the blocked attempts
-- =====================================================================
do $$
declare s su_snapshot%rowtype; v_n bigint;
begin
  select * into s from su_snapshot;
  select count(*) into v_n from public.contract_events
   where contract_id = current_setting('app.su_con_p2')::uuid
      or invoice_id = current_setting('app.su_off_x')::uuid;
  if v_n <> s.events_n then
    raise exception 'FAIL S5: blocked attempts must add no audit rows on untouched rows (% → %)', s.events_n, v_n;
  end if;
  if (select count(*) from public.rental_contracts where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1') <> s.contracts_n then
    raise exception 'FAIL S5: no contract may have been created while suspended';
  end if;
  if (select updated_at from public.rental_contracts where id = current_setting('app.su_con_p2')::uuid) <> s.con_p2_updated_at then
    raise exception 'FAIL S5: CON_P2 must be byte-for-byte untouched by the rejected activations';
  end if;
  if (select status from public.rental_invoices where id = current_setting('app.su_off_x')::uuid) <> 'issued' then
    raise exception 'FAIL S5: untouched offer must remain issued';
  end if;
  -- used moved ONLY by the authorized CON_A closure (−1000)
  if pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') <> s.used - 1000 then
    raise exception 'FAIL S5: eligibility changed outside the authorized closure (% → %)', s.used, pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1');
  end if;
  raise notice 'ok: S5 no unintended mutation, release or closure';
end $$;

-- =====================================================================
-- S6. Reactivation restores every capability
-- =====================================================================
do $$
declare v_n int; v_con uuid; v_used numeric;
begin
  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a9');
  set local role authenticated;
  update public.profiles set account_status = 'active'
   where id = 'eeee2222-0000-4000-8000-0000000000c1';
  reset role;

  perform pg_temp.as_user('eeee1111-0000-4000-8000-0000000000a1');
  select count(*) into v_n from public.lookup_renter_by_mobile('551110071');
  if v_n <> 1 then raise exception 'FAIL S6: lookup must work after reactivation'; end if;
  -- the S0 challenge is seconds old; age it past the 15 s double-tap throttle
  update public.renter_otp_challenges set created_at = created_at - interval '1 minute'
   where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1';
  perform public.merchant_start_renter_otp('551110071', 'inapp');
  if (select count(*) from public.renter_otp_challenges where customer_user_id = 'eeee2222-0000-4000-8000-0000000000c1')
     <> (select otp_n from su_snapshot) + 1 then
    raise exception 'FAIL S6: OTP start must create a challenge after reactivation';
  end if;

  v_used := pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1');
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c1');
  v_con := public.accept_rental_invoice(current_setting('app.su_off_x')::uuid);
  if (select status::text from public.rental_contracts where id = v_con) <> 'pending' then
    raise exception 'FAIL S6: acceptance must work after reactivation';
  end if;
  perform public.activate_rental_without_payment_and_note(current_setting('app.su_con_p2')::uuid);
  if (select status::text from public.rental_contracts where id = current_setting('app.su_con_p2')::uuid) <> 'active'
     or pg_temp.used_of('eeee2222-0000-4000-8000-0000000000c1') <> v_used + 1000 then
    raise exception 'FAIL S6: activation must work and commit exposure after reactivation';
  end if;
  perform pg_temp.mk_invoice(905, 'eeee2222-0000-4000-8000-0000000000c1');
  raise notice 'ok: S6 reactivation restored lookup, OTP, acceptance, activation, issuance';
end $$;

-- =====================================================================
-- S7. Authorization intact
-- =====================================================================
do $$
declare v_n int;
begin
  -- another customer cannot touch C1's status (RLS: self rows only → 0 rows, no error)
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c2');
  set local role authenticated;
  update public.profiles set full_name = full_name
   where id = 'eeee2222-0000-4000-8000-0000000000c1' and account_status = 'active';
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 0 then raise exception 'FAIL S7: another customer must not see/modify C1'; end if;

  -- customers cannot use the merchant entry points
  perform pg_temp.as_user('eeee2222-0000-4000-8000-0000000000c2');
  perform pg_temp.expect_error(
    'select * from public.lookup_renter_by_mobile(''551110071'')', 'P0030',
    'S7 customer calling the merchant lookup');
  perform pg_temp.expect_error(
    'select public.merchant_start_renter_otp(''551110071'', ''inapp'')', 'P0030',
    'S7 customer calling the merchant OTP start');

  -- the helper is internal: client roles cannot probe other accounts
  if has_function_privilege('authenticated', 'public.assert_customer_active(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.assert_customer_active(uuid,text)', 'execute') then
    raise exception 'FAIL S7: assert_customer_active must not be executable by client roles';
  end if;
  raise notice 'ok: S7 authorization surface intact';
end $$;

-- =====================================================================
-- S8. Structural guards
-- =====================================================================
do $$
declare v_src text; v_def text; v_first text; v_n int;
begin
  select prosrc into v_src from pg_proc where proname = 'assert_customer_active' and pronamespace = 'public'::regnamespace;
  if v_src !~* 'for share' then raise exception 'FAIL S8: helper must lock the profile row FOR SHARE (race safety)'; end if;
  if not (select prosecdef from pg_proc where proname = 'assert_customer_active' and pronamespace = 'public'::regnamespace) then
    raise exception 'FAIL S8: helper must be SECURITY DEFINER';
  end if;
  if (select provolatile from pg_proc where proname = 'lookup_renter_by_mobile' and pronamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'FAIL S8: lookup_renter_by_mobile must be VOLATILE (it takes a row lock now)';
  end if;
  for v_def in
    select proname from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('lookup_renter_by_mobile', 'merchant_start_renter_otp')
       and prosrc !~ 'assert_customer_active'
  loop
    raise exception 'FAIL S8: % does not call assert_customer_active', v_def;
  end loop;

  -- triggers bound and FIRST in BEFORE firing order on each table
  for v_def, v_first in
    select c.relname, min(t.tgname)
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and (t.tgtype & 2) = 2
       and c.relname in ('rental_invoices', 'rental_contracts', 'renter_otp_challenges')
     group by c.relname
  loop
    if v_first <> v_def || '_a0_guard_suspended_customer' then
      raise exception 'FAIL S8: % — suspension guard must fire first (first is %)', v_def, v_first;
    end if;
  end loop;
  select count(*) into v_n from pg_trigger
   where tgname in ('rental_invoices_a0_guard_suspended_customer',
                    'rental_contracts_a0_guard_suspended_customer',
                    'renter_otp_challenges_a0_guard_suspended_customer');
  if v_n <> 3 then raise exception 'FAIL S8: expected 3 suspension triggers, found %', v_n; end if;

  -- P0100 guard untouched
  select pg_get_triggerdef(oid) into v_def from pg_trigger where tgname = 'profiles_guard_privileged_columns';
  if v_def !~ 'old.account_status IS DISTINCT FROM new.account_status' or v_def !~ 'BEFORE UPDATE ON public.profiles' then
    raise exception 'FAIL S8: profiles_guard_privileged_columns changed: %', v_def;
  end if;

  -- RLS / grant surface unchanged (literal pre-migration counts)
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') <> 5
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rental_invoices') <> 7
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rental_contracts') <> 6
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'renter_otp_challenges') <> 0 then
    raise exception 'FAIL S8: RLS policy surface changed';
  end if;
  if has_table_privilege('authenticated', 'public.rental_contracts', 'insert')
     or not has_table_privilege('authenticated', 'public.rental_invoices', 'insert')
     or has_table_privilege('authenticated', 'public.renter_otp_challenges', 'select') then
    raise exception 'FAIL S8: table grant surface changed';
  end if;
  raise notice 'ok: S8 structural guards hold';
end $$;

do $$ begin raise notice '===== customer_suspension_enforcement_test PASSED ====='; end $$;
rollback;
