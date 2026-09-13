-- Tests for 20260502130200_renter_verification_status.sql
-- Run with psql AS A SUPERUSER/service context against a database with
-- ALL migrations applied (never production).
\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

begin;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values
  ('44444444-0000-0000-0000-0000000000a1','rvs-own@e.sa'),
  ('44444444-0000-0000-0000-0000000000a2','rvs-cust@e.sa'),
  ('44444444-0000-0000-0000-0000000000a3','rvs-other@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status, mobile) values
  ('44444444-0000-0000-0000-0000000000a1','Own','rvs-own@e.sa','merchant','active', null),
  ('44444444-0000-0000-0000-0000000000a2','عميل التحقق','rvs-cust@e.sa','customer','active','509990044'),
  ('44444444-0000-0000-0000-0000000000a3','Other','rvs-other@e.sa','merchant','active', null)
  on conflict (id) do update set mobile = excluded.mobile, role = excluded.role, full_name = excluded.full_name;

-- 1. Merchant starts + verifies a challenge through the REAL RPCs.
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select public.merchant_start_renter_otp('0509990044');
select set_config('request.jwt.claims', '', true);
select code_inapp as otp from public.renter_otp_challenges
 where customer_user_id = '44444444-0000-0000-0000-0000000000a2'
 order by created_at desc limit 1 \gset
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select teq('1 verify succeeds via real RPC',
  (select count(*)::text from public.merchant_verify_renter_otp('0509990044', :'otp')), '1');

-- 2. Status check: verified + inside the window → renter payload.
select teq('2 status returns the renter while issuable',
  (select full_name from public.merchant_renter_verification_status('0509990044')), 'عميل التحقق');

-- 3. Another merchant gets NOTHING for the same customer.
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a3','role','authenticated')::text, true) \gset
select teq('3 other merchant sees zero rows',
  (select count(*)::text from public.merchant_renter_verification_status('0509990044')), '0');

-- 4. Outside the 30-minute P0195 window → zero rows.
select set_config('request.jwt.claims', '', true);
update public.renter_otp_challenges set verified_at = now() - interval '31 minutes'
 where customer_user_id = '44444444-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select teq('4 lapsed window → zero rows',
  (select count(*)::text from public.merchant_renter_verification_status('0509990044')), '0');

-- 5. Spent challenge (used_invoice_id) → zero rows.
select set_config('request.jwt.claims', '', true);
set session_replication_role = replica;  -- scaffold-only: fake spent id
update public.renter_otp_challenges
   set verified_at = now(), used_invoice_id = gen_random_uuid(), used_at = now()
 where customer_user_id = '44444444-0000-0000-0000-0000000000a2';
set session_replication_role = origin;
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select teq('5 spent challenge → zero rows',
  (select count(*)::text from public.merchant_renter_verification_status('0509990044')), '0');

-- 6. Guards: customer role refused; bad mobile refused; unknown mobile empty.
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select traises('6a customer role refused (P0030)',
  $q$select * from public.merchant_renter_verification_status('0509990044')$q$, 'P0030');
select set_config('request.jwt.claims', json_build_object('sub','44444444-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select traises('6b invalid mobile refused (P0190)',
  $q$select * from public.merchant_renter_verification_status('123')$q$, 'P0190');
select teq('6c unknown mobile → zero rows',
  (select count(*)::text from public.merchant_renter_verification_status('0509990099')), '0');

rollback;
