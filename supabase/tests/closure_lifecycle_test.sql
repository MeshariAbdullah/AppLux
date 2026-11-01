-- =====================================================================
-- Package 1 regression — offer cancellation, supersession, closure
-- lifecycle, 48h automatic return confirmation (20260502130600)
-- =====================================================================
-- Runs on the hosted-faithful local replica (pgcrypto in `extensions`)
-- AFTER the full migration chain incl. 20260502130600. The whole suite
-- is one transaction and ROLLS BACK — it leaves no rows behind.
--
-- Actor simulation: set_config('request.jwt.claim.sub', …) drives
-- auth.uid(); service-role-only functions are exercised directly (the
-- replica runs as a superuser; their ACL gating is asserted separately).
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
-- Fixture: merchant M1 (+owner), merchant M2 (+owner), customers C1, C2
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-4000-8000-0000000000a1','authenticated','authenticated','p1+m1@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-4000-8000-0000000000a2','authenticated','authenticated','p1+m2@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','bbbb2222-0000-4000-8000-0000000000c1','authenticated','authenticated','p1+c1@lend.test',now(),now()),
 ('00000000-0000-0000-0000-000000000000','bbbb2222-0000-4000-8000-0000000000c2','authenticated','authenticated','p1+c2@lend.test',now(),now());

update public.profiles set role='merchant', account_status='active', full_name='P1 Merchant One', mobile='500000081'
 where id='bbbb1111-0000-4000-8000-0000000000a1';
update public.profiles set role='merchant', account_status='active', full_name='P1 Merchant Two', mobile='500000082'
 where id='bbbb1111-0000-4000-8000-0000000000a2';
update public.profiles set role='customer', account_status='active', full_name='P1 Customer One', mobile='551110081', national_id='1011111181'
 where id='bbbb2222-0000-4000-8000-0000000000c1';
update public.profiles set role='customer', account_status='active', full_name='P1 Customer Two', mobile='551110082', national_id='1011111182'
 where id='bbbb2222-0000-4000-8000-0000000000c2';

insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status) values
 ('bbbb3333-0000-4000-8000-0000000000a1','bbbb1111-0000-4000-8000-0000000000a1','P1 M1 Co','CR-1010000081','{"ar":"متجر الاختبار الأول","en":"P1 Store One"}','dress','الرياض','active'),
 ('bbbb3333-0000-4000-8000-0000000000a2','bbbb1111-0000-4000-8000-0000000000a2','P1 M2 Co','CR-1010000082','{"ar":"متجر الاختبار الثاني","en":"P1 Store Two"}','dress','الرياض','active');

-- invoice factory (privileged insert; the P0195 OTP gate exempts
-- auth.uid() IS NULL writers by design — gate behavior has its own
-- coverage in earlier suites)
create or replace function pg_temp.mk_invoice(
  p_n int, p_merchant uuid, p_customer uuid,
  p_total numeric default 1200, p_value numeric default 4800,
  p_replaces uuid default null
) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_anon();
  insert into public.rental_invoices
    (invoice_number, merchant_id, customer_user_id, status,
     subtotal_amount, tax_amount, total_amount, original_item_value,
     lessee_national_id, expires_at, replaces_invoice_id)
  values
    ('INV-P1-'||lpad(p_n::text, 4, '0'), p_merchant, p_customer, 'issued',
     p_total, 0, p_total, p_value,
     '1011111181', now() + interval '1 hour', p_replaces)
  returning id into v;
  return v;
end $$;

-- drive a contract to ACTIVE through the real customer path
create or replace function pg_temp.mk_active_contract(p_n int)
returns uuid language plpgsql as $$
declare v_inv uuid; v_con uuid;
begin
  v_inv := pg_temp.mk_invoice(p_n, 'bbbb3333-0000-4000-8000-0000000000a1',
                              'bbbb2222-0000-4000-8000-0000000000c1');
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_con := public.accept_rental_invoice(v_inv);
  insert into public.contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (v_con, 'bbbb2222-0000-4000-8000-0000000000c1', 'receipts/'||v_con||'/p1.png');
  perform public.confirm_contract_receipt_photos(v_con);
  perform public.activate_rental_without_payment_and_note(v_con);
  return v_con;
end $$;

create or replace function pg_temp.used_c1() returns numeric language sql as
$$ select used_amount from public.rental_eligibility
   where user_id = 'bbbb2222-0000-4000-8000-0000000000c1' $$;

do $$ begin
  if pg_temp.used_c1() <> 0 then raise exception 'FAIL: C1 baseline not zero'; end if;
  raise notice 'ok: fixture ready (C1 used=0)';
end $$;

-- =====================================================================
-- 1. Customer rejection: timestamp, event, merchant notification,
--    reservation release
-- =====================================================================
do $$
declare v_inv uuid; v_reserved numeric;
begin
  v_inv := pg_temp.mk_invoice(1, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c1');
  v_reserved := public.eligibility_reserved_amount('bbbb2222-0000-4000-8000-0000000000c1', null);
  if v_reserved <> 4800 then raise exception 'FAIL: reservation not held (got %)', v_reserved; end if;

  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  perform public.reject_rental_invoice(v_inv);
  perform public.reject_rental_invoice(v_inv);  -- idempotent re-reject

  if (select status from public.rental_invoices where id = v_inv) <> 'rejected'
     or (select rejected_at from public.rental_invoices where id = v_inv) is null then
    raise exception 'FAIL: rejection state/timestamp wrong';
  end if;
  if public.eligibility_reserved_amount('bbbb2222-0000-4000-8000-0000000000c1', null) <> 0 then
    raise exception 'FAIL: reservation not released after rejection';
  end if;
  if not exists (select 1 from public.contract_events
                  where invoice_id = v_inv and event = 'offer_rejected') then
    raise exception 'FAIL: offer_rejected event missing';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'bbbb1111-0000-4000-8000-0000000000a1'
                    and type = 'offer_rejected' and invoice_id = v_inv) then
    raise exception 'FAIL: merchant rejection notification missing';
  end if;
  raise notice 'ok: 1 rejection (timestamp, event, notification, release)';
end $$;

-- =====================================================================
-- 2. Merchant cancellation: owner-only, idempotent, notified, released;
--    blocked after acceptance. 20. unauthorized actors.
-- =====================================================================
do $$
declare v_inv uuid;
begin
  v_inv := pg_temp.mk_invoice(2, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c1');

  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a2');  -- other merchant
  perform pg_temp.expect_error(
    format('select public.merchant_cancel_rental_offer(%L)', v_inv),
    'P0002', '20 cross-merchant cancel refused');
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');  -- customer
  perform pg_temp.expect_error(
    format('select public.merchant_cancel_rental_offer(%L)', v_inv),
    'P0002', '20 customer cannot cancel merchant offer');

  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform public.merchant_cancel_rental_offer(v_inv);
  perform public.merchant_cancel_rental_offer(v_inv);  -- idempotent

  if (select status from public.rental_invoices where id = v_inv) <> 'cancelled'
     or (select cancelled_at from public.rental_invoices where id = v_inv) is null then
    raise exception 'FAIL: cancel state/timestamp wrong';
  end if;
  if public.eligibility_reserved_amount('bbbb2222-0000-4000-8000-0000000000c1', null) <> 0 then
    raise exception 'FAIL: reservation not released after cancel';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'bbbb2222-0000-4000-8000-0000000000c1'
                    and type = 'offer_cancelled' and invoice_id = v_inv) then
    raise exception 'FAIL: customer cancel notification missing';
  end if;
  if not exists (select 1 from public.contract_events
                  where invoice_id = v_inv and event = 'offer_cancelled') then
    raise exception 'FAIL: offer_cancelled event missing';
  end if;
  raise notice 'ok: 2 merchant cancellation + 20 authz negatives';
end $$;

do $$  -- cancel after acceptance refused
declare v_inv uuid; v_con uuid;
begin
  v_inv := pg_temp.mk_invoice(3, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c1');
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_con := public.accept_rental_invoice(v_inv);
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    format('select public.merchant_cancel_rental_offer(%L)', v_inv),
    'P0003', '2b cancel after acceptance refused');
  -- park this pending contract for scenario 5/6
  perform set_config('app.p1_pending_contract', v_con::text, false);
end $$;

-- =====================================================================
-- 3+4. Explicit supersession: linked, atomic, single-target; other
--      offers untouched; superseded offer not acceptable
-- =====================================================================
do $$
declare v_a uuid; v_b uuid; v_repl uuid;
begin
  v_a := pg_temp.mk_invoice(4, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c2', 500, 900);
  v_b := pg_temp.mk_invoice(5, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c2', 600, 1000);
  v_repl := pg_temp.mk_invoice(6, 'bbbb3333-0000-4000-8000-0000000000a1', 'bbbb2222-0000-4000-8000-0000000000c2', 550, 900, v_a);

  if (select status from public.rental_invoices where id = v_a) <> 'superseded' then
    raise exception 'FAIL: replaced offer not superseded';
  end if;
  if (select superseded_by_invoice_id from public.rental_invoices where id = v_a) <> v_repl
     or (select replaces_invoice_id from public.rental_invoices where id = v_repl) <> v_a then
    raise exception 'FAIL: supersession links wrong';
  end if;
  if (select status from public.rental_invoices where id = v_b) <> 'issued' then
    raise exception 'FAIL: independent offer was touched by supersession';
  end if;
  if not exists (select 1 from public.contract_events
                  where invoice_id = v_a and event = 'offer_superseded') then
    raise exception 'FAIL: offer_superseded event missing';
  end if;

  -- superseded offer cannot be accepted (concurrent-acceptance guard)
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c2');
  perform pg_temp.expect_error(
    format('select public.accept_rental_invoice(%L)', v_a),
    'P0003', '3b superseded offer not acceptable');

  -- cross-pair replacement refused
  perform pg_temp.as_anon();
  perform pg_temp.expect_error(
    format($q$
      insert into public.rental_invoices
        (invoice_number, merchant_id, customer_user_id, status, subtotal_amount,
         tax_amount, total_amount, original_item_value, lessee_national_id,
         expires_at, replaces_invoice_id)
      values ('INV-P1-XBAD', 'bbbb3333-0000-4000-8000-0000000000a2',
              'bbbb2222-0000-4000-8000-0000000000c2', 'issued',
              100, 0, 100, 200, '1011111182', now() + interval '1 hour', %L)
    $q$, v_b),
    'P0181', '3c cross-merchant replacement refused');

  -- tidy: cancel the open fixtures so later reservation math stays clean
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform public.merchant_cancel_rental_offer(v_b);
  perform public.merchant_cancel_rental_offer(v_repl);
  raise notice 'ok: 3+4 supersession semantics';
end $$;

-- =====================================================================
-- 5+6+16+20. Accepted-pending non-handover: reservation held; mutual
-- confirmation closes with not_handed_over; duplicates idempotent;
-- requester cannot self-confirm; outsiders refused; evidence guard.
-- =====================================================================
do $$
declare
  v_con uuid := current_setting('app.p1_pending_contract')::uuid;
  v_req uuid; v_req2 uuid;
  v_reason public.contract_closure_reason;
begin
  -- reservation held while accepted+pending (exposure 4800)
  if public.eligibility_reserved_amount('bbbb2222-0000-4000-8000-0000000000c1', null) <> 4800 then
    raise exception 'FAIL: pending contract must hold the 4800 reservation';
  end if;
  if pg_temp.used_c1() <> 0 then
    raise exception 'FAIL: pending contract must not commit used_amount';
  end if;

  -- outsider cannot request
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c2');
  perform pg_temp.expect_error(
    format('select public.request_contract_closure(%L, %L)', v_con, 'non_handover'),
    'P0021', '20 outsider cannot request closure');

  -- customer requests; duplicate returns the same id
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'non_handover');
  v_req2 := public.request_contract_closure(v_con, 'non_handover');
  if v_req <> v_req2 then raise exception 'FAIL: duplicate request not idempotent'; end if;

  -- requester cannot confirm their own declaration
  perform pg_temp.expect_error(
    format('select public.confirm_contract_closure(%L)', v_req),
    'P0032', '6b requester self-confirm refused');
  -- outsider cannot confirm
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a2');
  perform pg_temp.expect_error(
    format('select public.confirm_contract_closure(%L)', v_req),
    'P0021', '20 outsider cannot confirm');

  -- merchant confirms → closed as not_handed_over, reservation released
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  v_reason := public.confirm_contract_closure(v_req, 'لم تستلم العميلة القطعة');
  if v_reason <> 'not_handed_over' then
    raise exception 'FAIL: expected not_handed_over, got %', v_reason;
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'ended'
     or (select closure_reason from public.rental_contracts where id = v_con) <> 'not_handed_over'
     or (select closure_via from public.rental_contracts where id = v_con) <> 'mutual' then
    raise exception 'FAIL: contract closure fields wrong';
  end if;
  if public.eligibility_reserved_amount('bbbb2222-0000-4000-8000-0000000000c1', null) <> 0 then
    raise exception 'FAIL: reservation not released after non-handover closure';
  end if;
  if pg_temp.used_c1() <> 0 then
    raise exception 'FAIL: non-handover closure must not touch used_amount';
  end if;
  if not exists (select 1 from public.contract_events
                  where contract_id = v_con and event = 'contract_closed'
                    and reason = 'not_handed_over') then
    raise exception 'FAIL: contract_closed event missing';
  end if;
  raise notice 'ok: 5+6+16 non-handover lifecycle (+authz)';
end $$;

do $$  -- evidence guard: handover evidence forbids the non-handover path
declare v_con uuid; v_sql text;
begin
  v_con := pg_temp.mk_active_contract(7);  -- photos confirmed → active
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_sql := format('select public.request_contract_closure(%L, %L)', v_con, 'non_handover');
  perform pg_temp.expect_error(v_sql, 'P0025', '6c non-handover refused once active');
  perform set_config('app.p1_active_contract', v_con::text, false);
end $$;

-- =====================================================================
-- 7+8+18+21. Return declaration + merchant confirmation; early vs
-- normal reason; eligibility release; close RPC note persistence.
-- =====================================================================
do $$
declare
  v_con uuid := current_setting('app.p1_active_contract')::uuid;
  v_req uuid; v_reason public.contract_closure_reason;
begin
  if pg_temp.used_c1() <> 4800 then
    raise exception 'FAIL: activation should have committed 4800 (got %)', pg_temp.used_c1();
  end if;

  -- merchant cannot "declare a return" (their path is direct close)
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    format('select public.request_contract_closure(%L, %L)', v_con, 'return_declared'),
    'P0027', '7b merchant cannot declare the customer return');

  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared', now(), 'أعدتها بحالة ممتازة');
  if (select deadline_at from public.contract_closure_requests where id = v_req) is not null then
    raise exception 'FAIL: deadline must not start before verified delivery';
  end if;
  if not exists (select 1 from public.closure_notice_deliveries
                  where request_id = v_req and notice = 'return_declared' and status = 'queued') then
    raise exception 'FAIL: tracked notice row missing';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = 'bbbb1111-0000-4000-8000-0000000000a1' and type = 'return_declared') then
    raise exception 'FAIL: merchant return_declared notification missing';
  end if;

  -- merchant confirms receipt → mutual closure, early (end_date future)
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  v_reason := public.confirm_contract_closure(v_req);
  if v_reason <> 'returned_early' then
    raise exception 'FAIL: expected returned_early, got %', v_reason;
  end if;
  if pg_temp.used_c1() <> 0 then
    raise exception 'FAIL: eligibility not released on confirmed return';
  end if;
  raise notice 'ok: 7+8 declaration + confirmation (returned_early, released)';
end $$;

do $$  -- 18 normal return + 21 legacy close path with note + 23 compat
declare v_con uuid; v_note text;
begin
  v_con := pg_temp.mk_active_contract(8);
  update public.rental_contracts
     set start_date = current_date - 3, end_date = current_date - 1
   where id = v_con;
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(p_contract_id := v_con, p_note := 'إرجاع نظيف');
  if (select closure_reason from public.rental_contracts where id = v_con) <> 'returned' then
    raise exception 'FAIL: past-end_date close must derive returned';
  end if;
  if (select closure_note from public.rental_contracts where id = v_con) <> 'إرجاع نظيف' then
    raise exception 'FAIL: inspection note not persisted';
  end if;
  if pg_temp.used_c1() <> 0 then raise exception 'FAIL: release after normal close'; end if;
  -- idempotent re-close (legacy behavior preserved)
  perform public.close_rental_contract(v_con);
  -- single function only (no PostgREST overload ambiguity)
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'close_rental_contract') <> 1 then
    raise exception 'FAIL: close_rental_contract must have exactly one signature';
  end if;
  raise notice 'ok: 18+21+23 normal return, note persisted, single signature';
end $$;

-- =====================================================================
-- 9+15. Objection suspends auto-closure and routes to admin review;
-- empty reason refused; objection beats a later scheduler pass.
-- =====================================================================
do $$
declare v_con uuid; v_req uuid; v_summary jsonb;
begin
  v_con := pg_temp.mk_active_contract(9);
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');

  perform public.record_notice_delivery(  -- runs as superuser locally; ACL asserted below
    (select id from public.closure_notice_deliveries where request_id = v_req), 'delivered');
  update public.contract_closure_requests
     set deadline_at = now() - interval '1 minute' where id = v_req;  -- time travel

  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    format('select public.object_contract_closure(%L, %L)', v_req, '  '),
    'P0033', '9b empty objection reason refused');
  perform public.object_contract_closure(v_req, 'القطعة لم تصلني بعد');

  update public.platform_settings
     set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  update public.platform_settings
     set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';

  if (select status from public.contract_closure_requests where id = v_req) <> 'admin_review' then
    raise exception 'FAIL: objection must hold admin_review through the scheduler';
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'active' then
    raise exception 'FAIL: objected contract must stay active';
  end if;
  perform set_config('app.p1_objected_req', v_req::text, false);
  perform set_config('app.p1_objected_con', v_con::text, false);
  raise notice 'ok: 9+15 objection suspends automatic closure';
end $$;

-- =====================================================================
-- 10+11+12+24. Deadline mechanics: no delivery proof → no clock → no
-- close; failed delivery same; delivered+expired+flag OFF → no close;
-- flag ON → auto-close with procedural recording + reminders.
-- =====================================================================
do $$
declare
  v_con uuid; v_req uuid; v_d uuid; v_summary jsonb; v_used0 numeric;
begin
  -- Scenario 9's objected contract is intentionally still active and
  -- still holds its exposure, so assert on the delta, not on zero.
  v_used0 := pg_temp.used_c1();
  -- 11/12: failed delivery → clock never starts → scheduler never closes
  v_con := pg_temp.mk_active_contract(10);
  if pg_temp.used_c1() <> v_used0 + 4800 then
    raise exception 'FAIL: activation should have committed 4800 more';
  end if;
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');
  select id into v_d from public.closure_notice_deliveries where request_id = v_req;
  perform public.record_notice_delivery(v_d, 'failed', null, 'push token dead');
  update public.platform_settings set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  if (select status from public.contract_closure_requests where id = v_req) <> 'open'
     or (select deadline_at from public.contract_closure_requests where id = v_req) is not null then
    raise exception 'FAIL: failed delivery must never start the clock';
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'active' then
    raise exception 'FAIL: no delivery proof → no auto close';
  end if;

  -- now mark delivered → clock starts at 48h
  perform public.record_notice_delivery(v_d, 'delivered', 'prov-ref-1');
  if abs(extract(epoch from
       (select deadline_at from public.contract_closure_requests where id = v_req)
       - (now() + interval '48 hours'))) > 5 then
    raise exception 'FAIL: deadline must be delivery+48h';
  end if;

  -- 24: flag OFF at expiry → stays open
  update public.contract_closure_requests set deadline_at = now() - interval '1 minute' where id = v_req;
  update public.platform_settings set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  if (select status from public.contract_closure_requests where id = v_req) <> 'open' then
    raise exception 'FAIL: feature-flag OFF must block automatic closure';
  end if;

  -- reminders were emitted exactly once each (deadline already past both marks)
  if (select reminder_24_sent_at from public.contract_closure_requests where id = v_req) is null
     or (select reminder_final_sent_at from public.contract_closure_requests where id = v_req) is null then
    raise exception 'FAIL: reminder marks missing';
  end if;
  if (select count(*) from public.notifications
       where type in ('return_reminder', 'return_final_warning')
         and user_id = 'bbbb1111-0000-4000-8000-0000000000a1') <> 2 then
    raise exception 'FAIL: reminder notifications wrong count';
  end if;
  v_summary := public.process_return_declarations();  -- re-run: no duplicates
  if (select count(*) from public.notifications
       where type in ('return_reminder', 'return_final_warning')
         and user_id = 'bbbb1111-0000-4000-8000-0000000000a1') <> 2 then
    raise exception 'FAIL: reminders must not repeat on retry';
  end if;

  -- 10: flag ON → automatic procedural closure
  update public.platform_settings set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  update public.platform_settings set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';

  if (select status from public.contract_closure_requests where id = v_req) <> 'auto_closed' then
    raise exception 'FAIL: expected auto_closed request';
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'ended'
     or (select closure_via from public.rental_contracts where id = v_con) <> 'auto' then
    raise exception 'FAIL: auto closure fields wrong';
  end if;
  if not exists (select 1 from public.contract_events
                  where contract_id = v_con and event = 'auto_closure_executed'
                    and reason = 'merchant_non_response'
                    and (metadata->>'procedural_only')::boolean) then
    raise exception 'FAIL: procedural-only auto event missing';
  end if;
  if pg_temp.used_c1() <> v_used0 then
    raise exception 'FAIL: auto closure must release eligibility';
  end if;
  raise notice 'ok: 10+11+12+24 deadline, delivery proof, flag, reminders, retry';
end $$;

-- =====================================================================
-- 13+14. Open/escalated damage case blocks every closure path.
-- =====================================================================
do $$
declare v_con uuid; v_req uuid; v_case uuid; v_summary jsonb;
begin
  v_con := pg_temp.mk_active_contract(11);
  perform pg_temp.as_anon();
  insert into public.damage_cases
    (contract_id, merchant_id, customer_user_id, severity, status, claim_amount, case_number,
     description)
  values (v_con, 'bbbb3333-0000-4000-8000-0000000000a1',
          'bbbb2222-0000-4000-8000-0000000000c1', 'partial', 'open', 1440,
          'CASE-P1-0001', 'ضرر اختباري — حالة تمنع الإغلاق')
  returning id into v_case;

  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    format('select public.close_rental_contract(%L)', v_con),
    'P0022', '13 open damage blocks merchant close');

  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');
  perform public.record_notice_delivery(
    (select id from public.closure_notice_deliveries where request_id = v_req), 'delivered');
  update public.contract_closure_requests set deadline_at = now() - interval '1 minute' where id = v_req;

  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform pg_temp.expect_error(
    format('select public.confirm_contract_closure(%L)', v_req),
    'P0022', '13b open damage blocks confirmation');

  update public.platform_settings set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  update public.platform_settings set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';
  if (select status from public.rental_contracts where id = v_con) <> 'active' then
    raise exception 'FAIL: auto close must be blocked by open damage case';
  end if;
  if not exists (select 1 from public.contract_events
                  where contract_id = v_con and event = 'auto_closure_blocked'
                    and reason = 'open_damage_case') then
    raise exception 'FAIL: blocked event missing';
  end if;

  update public.damage_cases set status = 'escalated' where id = v_case;
  perform pg_temp.expect_error(
    format('select public.close_rental_contract(%L)', v_con),
    'P0022', '14 escalated dispute blocks close');
  raise notice 'ok: 13+14 damage/dispute blocking on every path';
end $$;

-- =====================================================================
-- 17. High-value policy: enabled+threshold → auto path escalates to
-- admin review instead of closing.
-- =====================================================================
do $$
declare v_con uuid; v_req uuid; v_summary jsonb;
begin
  v_con := pg_temp.mk_active_contract(12);  -- item value 4800
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');
  perform public.record_notice_delivery(
    (select id from public.closure_notice_deliveries where request_id = v_req), 'delivered');
  update public.contract_closure_requests set deadline_at = now() - interval '1 minute' where id = v_req;

  update public.platform_settings
     set value = '{"enabled": true, "threshold": 1000, "action": "exclude_auto_close"}'::jsonb
   where key = 'high_value_rental_policy';
  update public.platform_settings set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  update public.platform_settings set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';
  update public.platform_settings
     set value = '{"enabled": false, "threshold": null, "action": "exclude_auto_close"}'::jsonb
   where key = 'high_value_rental_policy';

  if (select status from public.contract_closure_requests where id = v_req) <> 'admin_review' then
    raise exception 'FAIL: high-value must escalate, not close';
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'active' then
    raise exception 'FAIL: high-value contract must stay active';
  end if;

  -- admin resolves the escalation by closing (admin path end-to-end)
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  update public.profiles set role = 'admin' where id = 'bbbb1111-0000-4000-8000-0000000000a2';
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a2');
  perform public.admin_resolve_closure_request(v_req, 'close', 'مراجعة إدارية: استلام مؤكد هاتفياً');
  if (select closure_via from public.rental_contracts where id = v_con) <> 'admin' then
    raise exception 'FAIL: admin resolution closure_via wrong';
  end if;
  update public.profiles set role = 'merchant' where id = 'bbbb1111-0000-4000-8000-0000000000a2';
  raise notice 'ok: 17 high-value exclusion + admin resolution';
end $$;

-- =====================================================================
-- 17b. High-value policy FAIL-CLOSED: policy ENABLED with threshold
-- NULL (or unparseable) must treat every contract as high-value and
-- escalate — never auto-close unrestricted on a misconfigured policy.
-- =====================================================================
do $$
declare v_con uuid; v_req uuid; v_summary jsonb;
begin
  v_con := pg_temp.mk_active_contract(13);
  perform pg_temp.as_user('bbbb2222-0000-4000-8000-0000000000c1');
  v_req := public.request_contract_closure(v_con, 'return_declared');
  perform public.record_notice_delivery(
    (select id from public.closure_notice_deliveries where request_id = v_req), 'delivered');
  update public.contract_closure_requests set deadline_at = now() - interval '1 minute' where id = v_req;

  -- enabled, threshold deliberately NULL
  update public.platform_settings
     set value = '{"enabled": true, "threshold": null, "action": "exclude_auto_close"}'::jsonb
   where key = 'high_value_rental_policy';
  update public.platform_settings set value = '{"enabled": true}'::jsonb where key = 'auto_return_closure';
  v_summary := public.process_return_declarations();
  update public.platform_settings set value = '{"enabled": false}'::jsonb where key = 'auto_return_closure';

  if (select status from public.contract_closure_requests where id = v_req) <> 'admin_review' then
    raise exception 'FAIL: enabled policy with NULL threshold must fail closed (escalate)';
  end if;
  if (select status from public.rental_contracts where id = v_con) <> 'active' then
    raise exception 'FAIL: contract auto-closed under a misconfigured high-value policy';
  end if;

  -- unparseable threshold must also fail closed (helper returns true)
  update public.platform_settings
     set value = '{"enabled": true, "threshold": "abc"}'::jsonb
   where key = 'high_value_rental_policy';
  if not public.is_high_value_contract((select c from public.rental_contracts c where c.id = v_con)) then
    raise exception 'FAIL: unparseable threshold must fail closed';
  end if;

  -- restore shipped defaults + resolve the escalation (void)
  update public.platform_settings
     set value = '{"enabled": false, "threshold": null, "action": "exclude_auto_close"}'::jsonb
   where key = 'high_value_rental_policy';
  update public.profiles set role = 'admin' where id = 'bbbb1111-0000-4000-8000-0000000000a2';
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a2');
  perform public.admin_resolve_closure_request(v_req, 'void', 'اختبار: إلغاء الطلب');
  update public.profiles set role = 'merchant' where id = 'bbbb1111-0000-4000-8000-0000000000a2';
  perform pg_temp.as_user('bbbb1111-0000-4000-8000-0000000000a1');
  perform public.close_rental_contract(v_con, null);
  raise notice 'ok: 17b misconfigured high-value policy fails closed';
end $$;

-- =====================================================================
-- 3d. Supersession trigger ordering under a BINDING eligibility
-- ceiling: with C2 limited so two same-size offers cannot coexist, a
-- plain second offer is refused (P0160) while an explicit replacement
-- succeeds — proving the replaced offer's reservation is freed BEFORE
-- the eligibility guard evaluates the new offer.
-- =====================================================================
do $$
declare v_a uuid; v_repl uuid;
begin
  update public.rental_eligibility set limit_amount = 1500
   where user_id = 'bbbb2222-0000-4000-8000-0000000000c2';

  v_a := pg_temp.mk_invoice(20, 'bbbb3333-0000-4000-8000-0000000000a1',
                            'bbbb2222-0000-4000-8000-0000000000c2', 300, 1400);

  -- ceiling is binding: a second independent 1400 offer must bounce
  perform pg_temp.expect_error(
    format($q$select pg_temp.mk_invoice(21, %L, %L, 300, 1400)$q$,
           'bbbb3333-0000-4000-8000-0000000000a1',
           'bbbb2222-0000-4000-8000-0000000000c2'),
    'P0160', '3d ceiling binds without supersession');

  -- the explicit replacement at the SAME size succeeds only because the
  -- supersede trigger (aa_) frees the old reservation first
  v_repl := pg_temp.mk_invoice(22, 'bbbb3333-0000-4000-8000-0000000000a1',
                               'bbbb2222-0000-4000-8000-0000000000c2', 300, 1400, v_a);
  if (select status from public.rental_invoices where id = v_a) <> 'superseded'
     or (select status from public.rental_invoices where id = v_repl) <> 'issued' then
    raise exception 'FAIL: ceiling-bound replacement state wrong';
  end if;

  update public.rental_eligibility set limit_amount = 100000
   where user_id = 'bbbb2222-0000-4000-8000-0000000000c2';
  raise notice 'ok: 3d supersession frees the reservation ahead of the ceiling check';
end $$;

-- =====================================================================
-- 22. Audit immutability + service-function ACLs + privilege audit
-- =====================================================================
do $$
begin
  if has_table_privilege('authenticated', 'public.contract_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.contract_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contract_events', 'DELETE')
     or has_table_privilege('anon', 'public.contract_events', 'SELECT') then
    raise exception 'FAIL: contract_events privileges too broad';
  end if;
  if has_table_privilege('authenticated', 'public.contract_closure_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.contract_closure_requests', 'UPDATE') then
    raise exception 'FAIL: closure_requests must be RPC-write-only';
  end if;
  if has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE')
     or has_table_privilege('anon', 'public.platform_settings', 'SELECT') then
    raise exception 'FAIL: platform_settings privileges too broad';
  end if;
  if has_function_privilege('authenticated', 'public.process_return_declarations()', 'execute')
     or has_function_privilege('authenticated', 'public.record_notice_delivery(uuid, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.finalize_contract_closure(uuid, public.contract_closure_via, text, public.contract_status)', 'execute') then
    raise exception 'FAIL: service/internal functions must not be client-executable';
  end if;
  raise notice 'ok: 22 audit immutability + least-privilege ACLs';
end $$;

rollback;
\echo ===== closure_lifecycle_test PASSED (scenarios 1-24 covered) =====
