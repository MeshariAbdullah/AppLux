-- Tests for 20260502130300_registration_preflight.sql
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

-- Local-shim alignment: real Supabase auth.users carries
-- email_confirmed_at (the precheck's confirmed-account predicate).
alter table auth.users add column if not exists email_confirmed_at timestamptz;

-- Fixtures: one CONFIRMED customer account holding a mobile, one
-- UNCONFIRMED account, plus a confirmed merchant account.
insert into auth.users (id, email, email_confirmed_at) values
  ('55555555-0000-0000-0000-0000000000b1','pf-taken@e.sa', now()),
  ('55555555-0000-0000-0000-0000000000b2','pf-unconf@e.sa', null),
  ('55555555-0000-0000-0000-0000000000b3','pf-merchant@e.sa', now())
  on conflict (id) do nothing;
update auth.users set email_confirmed_at = now()
 where id in ('55555555-0000-0000-0000-0000000000b1','55555555-0000-0000-0000-0000000000b3');
insert into public.profiles (id, full_name, email, role, account_status, mobile) values
  ('55555555-0000-0000-0000-0000000000b1','Taken Customer','pf-taken@e.sa','customer','active','571100001'),
  ('55555555-0000-0000-0000-0000000000b2','Unconfirmed','pf-unconf@e.sa','customer','active', null),
  ('55555555-0000-0000-0000-0000000000b3','Taken Merchant','pf-merchant@e.sa','merchant','active', null)
  on conflict (id) do update
    set mobile = excluded.mobile, role = excluded.role, full_name = excluded.full_name;

-- 1. Fresh email + fresh mobile → ok (customer and merchant).
select teq('1a new customer passes preflight',
  public.registration_otp_precheck('0571100002', 'customer', 'pf-new@e.sa'), 'ok');
select teq('1b new merchant passes preflight',
  public.registration_otp_precheck('0571100003', 'merchant', 'pf-new-m@e.sa'), 'ok');

-- 2. Confirmed email blocks BOTH signup roles (one auth namespace).
select teq('2a duplicate customer email blocked',
  public.registration_otp_precheck('0571100004', 'customer', 'pf-taken@e.sa'), 'email_taken');
select teq('2b duplicate merchant email blocked',
  public.registration_otp_precheck('0571100005', 'merchant', 'PF-Taken@e.sa'), 'email_taken');

-- 3. UNCONFIRMED email stays available (interrupted-signup resume).
select teq('3 unconfirmed email still available',
  public.registration_otp_precheck('0571100006', 'customer', 'pf-unconf@e.sa'), 'ok');

-- 4. Customer mobile held by an existing customer profile → blocked;
--    merchant signups have NO mobile uniqueness rule (20260502124200
--    decision — no constraint exists) → same number passes.
select teq('4a duplicate customer mobile blocked',
  public.registration_otp_precheck('0571100001', 'customer', 'pf-new2@e.sa'), 'mobile_taken');
select teq('4b merchant signup: no mobile rule, passes',
  public.registration_otp_precheck('0571100001', 'merchant', 'pf-new3@e.sa'), 'ok');

-- 5. No registration_otp_challenges row exists for ANY prechecked
--    number — duplicates never created a challenge, and neither did
--    the passing prechecks (only registration_otp_start creates one).
select teq('5 prechecks created zero challenges',
  (select count(*)::text from public.registration_otp_challenges
    where mobile like '5711000%'), '0');

-- 6. Valid preflight → the UNCHANGED challenge flow still works:
--    start creates the challenge and the returned code verifies.
select code as goodcode from public.registration_otp_start('0571100002', 'customer') \gset
select teq('6a challenge created after ok preflight',
  (select count(*)::text from public.registration_otp_challenges
    where mobile = '571100002' and superseded_at is null), '1');
select teq('6b returned code verifies via registration_otp_check',
  public.registration_otp_check('0571100002', :'goodcode')::text, 'true');

-- 7. Malformed input → typed statuses, nothing revealed.
select teq('7a invalid mobile', public.registration_otp_precheck('12345', 'customer', null), 'invalid_mobile');
select teq('7b invalid email', public.registration_otp_precheck('0571100007', 'customer', 'not-an-email'), 'invalid_email');
select teq('7c invalid role', public.registration_otp_precheck('0571100007', 'renter', null), 'invalid_input');

-- 8. Probe throttle: >10 prechecks per mobile per hour → rate_limited
--    (attempts are recorded even for duplicate outcomes).
do $$ begin
  for i in 1..10 loop
    perform public.registration_otp_precheck('0571100008', 'customer', null);
  end loop;
end $$;
select teq('8 11th probe rate-limited',
  public.registration_otp_precheck('0571100008', 'customer', null), 'rate_limited');

-- 9. End-user roles cannot call the precheck at all.
set local role anon;
select traises('9 anon refused',
  $sql$select public.registration_otp_precheck('0571100009','customer',null)$sql$, '42501');
reset role;

-- 10. The DB constraint remains the race-safe final authority: a
--     second customer profile with the taken mobile still violates
--     profiles_mobile_customer_unique.
select traises('10 unique index still guards signup',
  $sql$insert into public.profiles (id, full_name, email, role, account_status, mobile)
       values ('55555555-0000-0000-0000-0000000000b9','Race','pf-race@e.sa','customer','active','571100001')$sql$,
  '23505');

rollback;
