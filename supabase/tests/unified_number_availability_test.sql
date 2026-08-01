\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;

-- fixtures
insert into auth.users (id, email) values ('33333333-0000-0000-0000-000000000001','a@e.sa');
-- pending application with 7001111111
insert into public.merchant_applications (id, applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category, status)
  values ('33333333-0000-0000-0000-0000000000a1','33333333-0000-0000-0000-000000000001','Est','7001111111','R','1122334455','riyadh','dress','pending');
-- rejected application with 7002222222 (should NOT block)
insert into public.merchant_applications (id, applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category, status)
  values ('33333333-0000-0000-0000-0000000000a2','33333333-0000-0000-0000-000000000001','Est','7002222222','R','1122334455','riyadh','dress','rejected');
-- a merchant with 7003333333
insert into auth.users (id, email) values ('33333333-0000-0000-0000-000000000009','m@e.sa');
insert into public.profiles (id, full_name, email, role, account_status) values ('33333333-0000-0000-0000-000000000009','M','m@e.sa','merchant','active') on conflict (id) do nothing;
insert into public.merchants (owner_user_id, company_name, unified_number, display_name, primary_category, city, status)
  values ('33333333-0000-0000-0000-000000000009','MerCo','7003333333', '{"ar":"x","en":"x"}'::jsonb, 'dress','riyadh','active');

select teq('avail: fresh number available', public.check_unified_number_available('7009999999')::text, 'true');
select teq('avail: pending application blocks', public.check_unified_number_available('7001111111')::text, 'false');
select teq('avail: rejected application does NOT block', public.check_unified_number_available('7002222222')::text, 'true');
select teq('avail: existing merchant blocks', public.check_unified_number_available('7003333333')::text, 'false');
select teq('avail: normalizes arabic-ish/spaces', public.check_unified_number_available(' 700 111 1111 ')::text, 'false');
select teq('avail: malformed (non-700) → false', public.check_unified_number_available('1234567890')::text, 'false');
select teq('avail: malformed (short) → false', public.check_unified_number_available('70011')::text, 'false');

-- anon can execute (grant check)
select teq('grant: anon may execute',
  has_function_privilege('anon', 'public.check_unified_number_available(text)', 'execute')::text, 'true');

select '===== AVAILABILITY TESTS PASSED =====' as r;
