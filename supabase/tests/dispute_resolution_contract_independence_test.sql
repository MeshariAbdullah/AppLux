-- =====================================================================
-- D-1 regression — dispute resolution never ends the contract nor
-- releases eligibility (20260502130700)
-- =====================================================================
-- Runs on the hosted-faithful local replica (pgcrypto in `extensions`)
-- AFTER the full migration chain incl. 20260502130700. One transaction,
-- ROLLBACK at the end — leaves no rows behind.
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
-- Fixture: merchant owner + merchant, customer, admin
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000','dddd1111-0000-4000-8000-0000000000a1','authenticated','authenticated','d1+owner@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','dddd1111-0000-4000-8000-0000000000a9','authenticated','authenticated','d1+admin@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','dddd2222-0000-4000-8000-0000000000c1','authenticated','authenticated','d1+cust@lend.test',now(),now());

update public.profiles set role='merchant', account_status='active', full_name='D1 Owner', mobile='500000091'
 where id='dddd1111-0000-4000-8000-0000000000a1';
update public.profiles set role='admin', account_status='active', full_name='D1 Admin', mobile='500000099'
 where id='dddd1111-0000-4000-8000-0000000000a9';
update public.profiles set role='customer', account_status='active', full_name='D1 Customer', mobile='551110091', national_id='1011111191'
 where id='dddd2222-0000-4000-8000-0000000000c1';

insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status) values
 ('dddd3333-0000-4000-8000-0000000000a1','dddd1111-0000-4000-8000-0000000000a1','D1 Co','CR-1010000091','{"ar":"متجر د1","en":"D1 Store"}','dress','الرياض','active');

create or replace function pg_temp.mk_invoice(p_n int, p_value numeric default 4800)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_anon();
  insert into public.rental_invoices
    (invoice_number, merchant_id, customer_user_id, status,
     subtotal_amount, tax_amount, total_amount, original_item_value,
     lessee_national_id, expires_at)
  values
    ('INV-D1-'||lpad(p_n::text, 4, '0'), 'dddd3333-0000-4000-8000-0000000000a1',
     'dddd2222-0000-4000-8000-0000000000c1', 'issued',
     1200, 0, 1200, p_value, '1011111191', now() + interval '1 hour')
  returning id into v;
  return v;
end $$;

-- real customer path → ACTIVE rental
create or replace function pg_temp.mk_active_contract(p_n int, p_value numeric default 4800)
returns uuid language plpgsql as $$
declare v_inv uuid; v_con uuid;
begin
  v_inv := pg_temp.mk_invoice(p_n, p_value);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  v_con := public.accept_rental_invoice(v_inv);
  insert into public.contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (v_con, 'dddd2222-0000-4000-8000-0000000000c1', 'receipts/'||v_con||'/d1.png');
  perform public.confirm_contract_receipt_photos(v_con);
  perform public.activate_rental_without_payment_and_note(v_con);
  return v_con;
end $$;

-- merchant files a claim (privileged insert; insert trigger sets the deadline + events)
create or replace function pg_temp.mk_case(p_n int, p_con uuid, p_sev public.damage_severity, p_amount numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  insert into public.damage_cases
    (case_number, contract_id, customer_user_id, merchant_id, severity, claim_amount, description, raised_by_user_id)
  values ('DC-D1-'||lpad(p_n::text, 4, '0'), p_con, 'dddd2222-0000-4000-8000-0000000000c1',
          'dddd3333-0000-4000-8000-0000000000a1', p_sev, p_amount, 'اختبار D-1 — بيانات وهمية',
          'dddd1111-0000-4000-8000-0000000000a1')
  returning id into v;
  return v;
end $$;

create or replace function pg_temp.used_c1() returns numeric language sql as
$$ select used_amount from public.rental_eligibility where user_id = 'dddd2222-0000-4000-8000-0000000000c1' $$;

-- the common D-1 assertion block: contract still active, eligibility
-- unchanged, no closure event, exactly one terminal audit row for the case
create or replace function pg_temp.assert_independent(p_con uuid, p_case uuid, p_used_before numeric, p_label text)
returns void language plpgsql as $$
declare v_status text; v_n int; v_meta jsonb;
begin
  select status::text into v_status from public.rental_contracts where id = p_con;
  if v_status <> 'active' then
    raise exception 'FAIL %: contract must stay active (got %)', p_label, v_status;
  end if;
  if (select ended_at from public.rental_contracts where id = p_con) is not null then
    raise exception 'FAIL %: ended_at must stay null', p_label;
  end if;
  if pg_temp.used_c1() <> p_used_before then
    raise exception 'FAIL %: eligibility must stay committed (% → %)', p_label, p_used_before, pg_temp.used_c1();
  end if;
  if exists (select 1 from public.contract_events where contract_id = p_con and event = 'contract_closed') then
    raise exception 'FAIL %: no contract_closed event may exist', p_label;
  end if;
  select count(*) into v_n from public.contract_events
   where contract_id = p_con and event = 'dispute_terminal_recorded' and metadata->>'case_id' = p_case::text;
  select metadata into v_meta from public.contract_events
   where contract_id = p_con and event = 'dispute_terminal_recorded' and metadata->>'case_id' = p_case::text
   limit 1;
  if v_n <> 1 then
    raise exception 'FAIL %: expected exactly one dispute_terminal_recorded (got %)', p_label, v_n;
  end if;
  if (v_meta->>'lifecycle_unaffected')::boolean is not true
     or (v_meta->>'asset_return_recorded')::boolean is not false
     or v_meta->>'contract_status' <> 'active' then
    raise exception 'FAIL %: terminal audit metadata wrong: %', p_label, v_meta;
  end if;
  raise notice 'ok: % — contract active, eligibility held, audited once', p_label;
end $$;

do $$ begin
  if pg_temp.used_c1() <> 0 then raise exception 'FAIL: baseline used must be 0'; end if;
  raise notice 'ok: fixture ready';
end $$;

-- =====================================================================
-- S1. partial + claim_accepted
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric;
begin
  v_con := pg_temp.mk_active_contract(1);
  v_used := pg_temp.used_c1();
  if v_used <> 4800 then raise exception 'FAIL S1: activation must commit 4800'; end if;
  v_case := pg_temp.mk_case(1, v_con, 'partial', 800);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_accept_claim(v_case);
  if (select status::text||'/'||dispute_phase::text||'/'||dispute_outcome::text from public.damage_cases where id = v_case)
     <> 'settled/resolved/claim_accepted' then
    raise exception 'FAIL S1: case state wrong';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S1 partial/claim_accepted');
  perform set_config('app.d1_s1_con', v_con::text, false);
end $$;

-- =====================================================================
-- S9 (continues S1). Authorized return closure after settlement:
-- merchant close → ended, derived reason, single release, audited.
-- Also: a promissory note on the contract must not block the close
-- and is left exactly as it was (no note rule changed in this package).
-- =====================================================================
do $$
declare v_con uuid := current_setting('app.d1_s1_con')::uuid; v_used numeric; v_note uuid;
begin
  v_used := pg_temp.used_c1();
  insert into public.promissory_notes (reference_number, contract_id, customer_user_id, merchant_id, beneficiary_name, principal_amount, due_date, status)
  values ('PN-D1-0001', v_con, 'dddd2222-0000-4000-8000-0000000000c1', 'dddd3333-0000-4000-8000-0000000000a1', 'D1 Co', 4800, current_date + 30, 'signed')
  returning id into v_note;
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, 'استلام القطعة بعد التسوية');
  if (select status::text||'/'||closure_reason::text||'/'||closure_via::text from public.rental_contracts where id = v_con)
     <> 'ended/returned_early/merchant' then
    raise exception 'FAIL S9: close after settlement wrong: %', (select row_to_json(c) from public.rental_contracts c where id = v_con);
  end if;
  if pg_temp.used_c1() <> v_used - 4800 then raise exception 'FAIL S9: release must happen exactly once at closure'; end if;
  if (select count(*) from public.contract_events where contract_id = v_con and event = 'contract_closed') <> 1 then
    raise exception 'FAIL S9: contract_closed audit missing';
  end if;
  if (select status::text from public.promissory_notes where id = v_note) <> 'signed' then
    raise exception 'FAIL S9: note rule changed unexpectedly';
  end if;
  perform public.close_rental_contract(v_con, null);  -- idempotent
  if pg_temp.used_c1() <> v_used - 4800 then raise exception 'FAIL S9: double release on re-close'; end if;
  raise notice 'ok: S9 return closure after settlement (single release, audited, note untouched)';
end $$;

-- =====================================================================
-- S2. partial + direct_settlement (objection → merchant proposal → accept)
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric; v_prop uuid;
begin
  v_con := pg_temp.mk_active_contract(2);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(2, v_con, 'partial', 900);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_object_to_claim(v_case, 'الضرر سابق للاستلام');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  v_prop := public.submit_settlement_proposal(v_case, 600, 'عرض تسوية');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_settlement_proposal(v_prop, true);
  if (select status::text||'/'||dispute_outcome::text||'/'||agreed_amount::text from public.damage_cases where id = v_case)
     <> 'settled/direct_settlement/600.00' then
    raise exception 'FAIL S2: case state wrong';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S2 partial/direct_settlement');
  perform set_config('app.d1_s2_con', v_con::text, false);
end $$;

-- =====================================================================
-- S14 (continues S2). A NEW case after a settled one is allowed, blocks
-- closure again (P0022); after admin dismissal the close works.
-- =====================================================================
do $$
declare v_con uuid := current_setting('app.d1_s2_con')::uuid; v_case2 uuid; v_used numeric;
begin
  v_used := pg_temp.used_c1();
  v_case2 := pg_temp.mk_case(3, v_con, 'partial', 200);
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(format('select public.close_rental_contract(%L, null)', v_con), 'P0022', 'S14 second open case blocks closure');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a9');
  perform public.admin_dismiss_dispute_case(v_case2, 'بلاغ مكرر — اختبار');
  perform pg_temp.assert_independent(v_con, v_case2, v_used, 'S14/S8 dismissal (second case)');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  if (select status::text from public.rental_contracts where id = v_con) <> 'ended' or pg_temp.used_c1() <> v_used - 4800 then
    raise exception 'FAIL S14/S11: close after dismissal must end + release once';
  end if;
  raise notice 'ok: S14/S11 new case after settlement, dismissal, then normal close';
end $$;

-- =====================================================================
-- S3 + S4. two rejected direct rounds → lend_mediation (not terminal) →
-- Lend proposal accepted by both → lend_settlement; then S10: customer
-- return declaration + merchant confirmation closes (mutual).
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric; v_p1 uuid; v_p2 uuid; v_lp uuid; v_req uuid;
begin
  v_con := pg_temp.mk_active_contract(4);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(4, v_con, 'partial', 900);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_object_to_claim(v_case, 'اعتراض');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  v_p1 := public.submit_settlement_proposal(v_case, 700, 'r1');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_settlement_proposal(v_p1, false);
  v_p2 := public.submit_settlement_proposal(v_case, 300, 'r2');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.respond_to_settlement_proposal(v_p2, false);
  if (select status::text||'/'||dispute_phase::text from public.damage_cases where id = v_case) <> 'open/lend_mediation' then
    raise exception 'FAIL S3: expected open/lend_mediation';
  end if;
  if (select status::text from public.rental_contracts where id = v_con) <> 'active' or pg_temp.used_c1() <> v_used then
    raise exception 'FAIL S3: mediation must not touch the contract';
  end if;
  perform pg_temp.expect_error(format('select public.close_rental_contract(%L, null)', v_con), 'P0022', 'S3 close blocked during mediation');
  raise notice 'ok: S3 two rejections → lend_mediation, contract untouched';

  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a9');
  v_lp := public.lend_submit_mediation_proposal(v_case, 450, 'اقتراح محايد');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_lend_proposal(v_case, true);
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.respond_to_lend_proposal(v_case, true);
  if (select status::text||'/'||dispute_outcome::text from public.damage_cases where id = v_case) <> 'settled/lend_settlement' then
    raise exception 'FAIL S4: expected settled/lend_settlement';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S4 lend_settlement');

  -- S10: Package 1 return path after a Lend settlement
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.confirm_contract_closure(v_req, null);
  if (select status::text||'/'||closure_reason::text||'/'||closure_via::text from public.rental_contracts where id = v_con) <> 'ended/returned_early/mutual' then
    raise exception 'FAIL S10: mutual return closure after settlement wrong';
  end if;
  if pg_temp.used_c1() <> v_used - 4800 then raise exception 'FAIL S10: single release at mutual closure'; end if;
  raise notice 'ok: S10 declared-return + confirmation after settlement';
end $$;

-- =====================================================================
-- S5. unresolved (Lend proposal rejected) — contract untouched
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric; v_p1 uuid; v_p2 uuid; v_lp uuid;
begin
  v_con := pg_temp.mk_active_contract(5);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(5, v_con, 'partial', 500);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_object_to_claim(v_case, 'اعتراض');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  v_p1 := public.submit_settlement_proposal(v_case, 400, 'r1');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_settlement_proposal(v_p1, false);
  v_p2 := public.submit_settlement_proposal(v_case, 100, 'r2');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.respond_to_settlement_proposal(v_p2, false);
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a9');
  v_lp := public.lend_submit_mediation_proposal(v_case, 250, 'اقتراح');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_lend_proposal(v_case, false);
  if (select status::text||'/'||dispute_outcome::text from public.damage_cases where id = v_case) <> 'unresolved/unresolved' then
    raise exception 'FAIL S5: expected unresolved';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S5 unresolved');
  -- unresolved does not block an authorized close either
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  if pg_temp.used_c1() <> v_used - 4800 then raise exception 'FAIL S5: close after unresolved must release once'; end if;
  raise notice 'ok: S5 unresolved then authorized close';
end $$;

-- =====================================================================
-- S6. TOTAL severity + claim_accepted — still no auto-end
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric;
begin
  v_con := pg_temp.mk_active_contract(6);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(6, v_con, 'total', 4800);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_accept_claim(v_case);
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S6 total/claim_accepted');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  raise notice 'ok: S6 total severity: closure only through the authorized path';
end $$;

-- =====================================================================
-- S7. NON_RETURN severity + direct_settlement — still no auto-end
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric; v_prop uuid;
begin
  v_con := pg_temp.mk_active_contract(7);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(7, v_con, 'non_return', 4800);
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_object_to_claim(v_case, 'اعتراض');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  v_prop := public.submit_settlement_proposal(v_case, 4000, 'تسوية');
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.respond_to_settlement_proposal(v_prop, true);
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S7 non_return/direct_settlement');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  raise notice 'ok: S7 non_return severity: no auto-end, no auto-release';
end $$;

-- =====================================================================
-- S8. dismissal with reason (first case on a contract)
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric;
begin
  v_con := pg_temp.mk_active_contract(8);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(8, v_con, 'partial', 300);
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a9');
  perform public.admin_dismiss_dispute_case(v_case, 'سبب إداري موثق');
  if (select status::text||'/'||dispute_phase::text||'/'||dispute_outcome::text from public.damage_cases where id = v_case) <> 'dismissed/resolved/dismissed' then
    raise exception 'FAIL S8: dismissal state wrong';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S8 dismissed');
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  raise notice 'ok: S8 dismissal then normal close';
end $$;

-- =====================================================================
-- S12. Terminal outcome on a contract that is ALREADY ended (fixture
-- flip simulating a legacy state): no error, contract untouched,
-- audit row records contract_status='ended'.
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric; v_ended timestamptz;
begin
  v_con := pg_temp.mk_active_contract(9);
  v_case := pg_temp.mk_case(9, v_con, 'partial', 100);
  perform pg_temp.as_anon();
  update public.rental_contracts set status = 'ended', ended_at = now() - interval '1 day' where id = v_con;
  select ended_at into v_ended from public.rental_contracts where id = v_con;
  v_used := pg_temp.used_c1();
  perform pg_temp.as_user('dddd2222-0000-4000-8000-0000000000c1');
  perform public.customer_accept_claim(v_case);
  if (select ended_at from public.rental_contracts where id = v_con) <> v_ended or pg_temp.used_c1() <> v_used then
    raise exception 'FAIL S12: already-ended contract must be untouched';
  end if;
  if (select metadata->>'contract_status' from public.contract_events where contract_id = v_con and event = 'dispute_terminal_recorded') <> 'ended' then
    raise exception 'FAIL S12: audit must record the real contract status';
  end if;
  perform pg_temp.as_anon();
  update public.rental_eligibility set used_amount = used_amount - 4800 where user_id = 'dddd2222-0000-4000-8000-0000000000c1'; -- fixture cleanup of the simulated legacy end
  raise notice 'ok: S12 terminal outcome on an already-ended contract is a no-op';
end $$;

-- =====================================================================
-- S13. Out-of-band status flip → phase synced, contract untouched,
-- audit once; a second (terminal→terminal) flip adds nothing.
-- =====================================================================
do $$
declare v_con uuid; v_case uuid; v_used numeric;
begin
  v_con := pg_temp.mk_active_contract(10);
  v_used := pg_temp.used_c1();
  v_case := pg_temp.mk_case(10, v_con, 'partial', 100);
  perform pg_temp.as_anon();
  update public.damage_cases set status = 'settled' where id = v_case;
  if (select dispute_phase::text from public.damage_cases where id = v_case) <> 'resolved' then
    raise exception 'FAIL S13: dispute_phase sync lost';
  end if;
  perform pg_temp.assert_independent(v_con, v_case, v_used, 'S13 out-of-band flip');
  update public.damage_cases set status = 'unresolved' where id = v_case;
  if (select count(*) from public.contract_events where contract_id = v_con and event = 'dispute_terminal_recorded') <> 1 then
    raise exception 'FAIL S13: terminal→terminal flip must not add audit rows';
  end if;
  perform pg_temp.as_user('dddd1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  raise notice 'ok: S13 out-of-band flip: sync kept, audited once';
end $$;

-- =====================================================================
-- S15. Eligibility exactly-once across the whole run: everything closed
-- =====================================================================
do $$ begin
  if pg_temp.used_c1() <> 0 then
    raise exception 'FAIL S15: used must return to 0 after all closures (got %)', pg_temp.used_c1();
  end if;
  raise notice 'ok: S15 eligibility reconciled to baseline';
end $$;

-- =====================================================================
-- S16. Source guard — the trigger function neither ends contracts, nor
-- invokes a closure transition, nor decrements eligibility. (It MAY
-- read rental_contracts for the audit row and the phase sync.)
-- =====================================================================
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'on_damage_case_resolved';
  if v_src ~* 'status\s*=\s*''ended''' or v_src ~* 'ended_at\s*=' then
    raise exception 'FAIL S16: trigger still ends contracts';
  end if;
  if v_src ~* 'used_amount' or v_src ~* 'rental_eligibility' then
    raise exception 'FAIL S16: trigger still touches eligibility';
  end if;
  if v_src ~* 'finalize_contract_closure' or v_src ~* 'close_rental_contract' then
    raise exception 'FAIL S16: trigger invokes a closure transition';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_on_damage_case_resolved' and tgrelid = 'public.damage_cases'::regclass) then
    raise exception 'FAIL S16: trigger missing';
  end if;
  -- ACL unchanged: clients still cannot write audit rows
  if has_table_privilege('authenticated', 'public.contract_events', 'INSERT') then
    raise exception 'FAIL S16: audit table must stay client-read-only';
  end if;
  raise notice 'ok: S16 source + ACL guard';
end $$;

select '===== dispute_resolution_contract_independence_test PASSED =====' as result;
rollback;
