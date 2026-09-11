-- Tests for 20260502125600_registration_otp.sql
-- Run with psql AS A SUPERUSER/service context against a database with
-- ALL migrations applied (never production). Style matches the other
-- supabase/tests files.
\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

begin;
select set_config('request.jwt.claims', '', true);

-- 1. Start issues a 6-digit code; only the hash is stored.
select * from public.registration_otp_start('0512345678') \gset c1_
select teq('1a code is 6 digits', (length(:'c1_code') = 6 and :'c1_code' ~ '^\d{6}$')::text, 'true');
select teq('1b hash stored, plaintext not stored',
  (select (code_hash = encode(extensions.digest(convert_to(:'c1_code','UTF8'),'sha256'),'hex'))::text
     from registration_otp_challenges where id = :'c1_challenge_id'), 'true');
select teq('1c expiry ~5 minutes',
  (select (expires_at between now() + interval '4 minutes' and now() + interval '6 minutes')::text
     from registration_otp_challenges where id = :'c1_challenge_id'), 'true');

-- 2. Resend cooldown: a second start inside 60s is refused.
select traises('2 cooldown enforced',
  $q$select public.registration_otp_start('0512345678')$q$, 'P0192');

-- 3. Wrong code: counted, returns false; correct code verifies.
select teq('3a wrong code returns false',
  (select public.registration_otp_check('0512345678', '000000')::text), 'false');
select teq('3b attempt counted',
  (select attempts::text from registration_otp_challenges where id = :'c1_challenge_id'), '1');
select teq('3c correct code verifies',
  (select public.registration_otp_check('0512345678', :'c1_code')::text), 'true');

-- 4. Verified challenge stamps mobile_verified_at at profile creation
--    and is consumed (single use).
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-0000000000b1','regotp@e.sa') on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, mobile)
  values ('99999999-0000-0000-0000-0000000000b1','Reg Otp','regotp@e.sa','customer','512345678');
select teq('4a mobile_verified_at stamped',
  (select (mobile_verified_at is not null)::text from profiles
    where id = '99999999-0000-0000-0000-0000000000b1'), 'true');
select teq('4b challenge consumed',
  (select (consumed_at is not null)::text from registration_otp_challenges
    where id = :'c1_challenge_id'), 'true');

-- 5. Expired code: refused with P0193.
insert into public.registration_otp_challenges (mobile, code_hash, expires_at)
values ('512340000', encode(extensions.digest(convert_to('123456','UTF8'),'sha256'),'hex'),
        now() - interval '1 minute');
select traises('5 expired code refused',
  $q$select public.registration_otp_check('0512340000', '123456')$q$, 'P0193');

-- 6. Attempt cap: 5 wrong attempts lock the challenge (P0194).
insert into public.registration_otp_challenges (mobile, code_hash, expires_at, attempts)
values ('512341111', encode(extensions.digest(convert_to('654321','UTF8'),'sha256'),'hex'),
        now() + interval '5 minutes', 5);
select traises('6 attempt cap enforced',
  $q$select public.registration_otp_check('0512341111', '654321')$q$, 'P0194');

-- 7. End-user roles can NEVER call the RPCs (42501), even via definer.
select set_config('request.jwt.claims',
  json_build_object('sub','99999999-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
set local role authenticated;
select traises('7a start refused for authenticated',
  $q$select public.registration_otp_start('0512345678')$q$, '42501');
select traises('7b check refused for authenticated',
  $q$select public.registration_otp_check('0512345678','123456')$q$, '42501');
reset role;

-- 8. Profile without any challenge inserts normally, unverified.
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-0000000000b2','regotp2@e.sa') on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, mobile)
  values ('99999999-0000-0000-0000-0000000000b2','No Otp','regotp2@e.sa','customer','512349999');
select teq('8 no challenge → NULL stamp, insert succeeds',
  (select (mobile_verified_at is null)::text from profiles
    where id = '99999999-0000-0000-0000-0000000000b2'), 'true');

-- 9. MERCHANT flow: role recorded; verification stamps the
--    application's contact_mobile_verified_at (not profiles) and is
--    consumed; a CUSTOMER challenge never stamps an application.
select * from public.registration_otp_start('0512347777', 'merchant') \gset m1_
select teq('9a role recorded',
  (select account_role from registration_otp_challenges where id = :'m1_challenge_id'), 'merchant');
select teq('9b merchant code verifies',
  (select public.registration_otp_check('0512347777', :'m1_code')::text), 'true');
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-0000000000b3','regotp-m@e.sa') on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status)
  values ('99999999-0000-0000-0000-0000000000b3','Merchant Reg','regotp-m@e.sa','merchant','pending');
insert into public.merchant_applications
  (applicant_user_id, company_name, commercial_reg_number, authorized_name,
   authorized_national_id, city, primary_category, contact_phone)
values ('99999999-0000-0000-0000-0000000000b3','Test Co','1010000000','Rep Name',
        '1000000000','riyadh','dress','512347777');
select teq('9c application stamped',
  (select (contact_mobile_verified_at is not null)::text from merchant_applications
    where applicant_user_id = '99999999-0000-0000-0000-0000000000b3'), 'true');
select teq('9d merchant challenge consumed',
  (select (consumed_at is not null)::text from registration_otp_challenges
    where id = :'m1_challenge_id'), 'true');
select teq('9e merchant profile NOT mobile-stamped (no profiles.mobile)',
  (select (mobile_verified_at is null)::text from profiles
    where id = '99999999-0000-0000-0000-0000000000b3'), 'true');

-- 10. Role scoping: a verified CUSTOMER challenge does not stamp a
--     merchant application for the same number.
select * from public.registration_otp_start('0512348888', 'customer') \gset c2_
select teq('10a customer code verifies',
  (select public.registration_otp_check('0512348888', :'c2_code')::text), 'true');
insert into public.merchant_applications
  (applicant_user_id, company_name, commercial_reg_number, authorized_name,
   authorized_national_id, city, primary_category, contact_phone)
values ('99999999-0000-0000-0000-0000000000b3','Test Co 2','1010000001','Rep Name',
        '1000000000','riyadh','dress','512348888');
select teq('10b customer challenge does NOT stamp an application',
  (select (contact_mobile_verified_at is null)::text from merchant_applications
    where commercial_reg_number = '1010000001'), 'true');

-- 11. Cooldown is per-mobile across roles (one live code per number).
select traises('11 cross-role cooldown',
  $q$select public.registration_otp_start('0512347777', 'customer')$q$, 'P0192');

rollback;
