\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

-- fixtures: merchant owner + customer + a merchant
insert into auth.users (id, email) values ('77777777-0000-0000-0000-0000000000a1','own@e.sa'),('77777777-0000-0000-0000-0000000000a2','cust@e.sa');
insert into public.profiles (id, full_name, email, role, account_status) values
  ('77777777-0000-0000-0000-0000000000a1','Own','own@e.sa','merchant','active') on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status) values
  ('77777777-0000-0000-0000-0000000000a2','Cust','cust@e.sa','customer','active') on conflict (id) do nothing;
insert into public.merchants (id, owner_user_id, company_name, unified_number, display_name, primary_category, city, status)
  values ('77777777-0000-0000-0000-000000000f01','77777777-0000-0000-0000-0000000000a1','Co','7001234567','{"ar":"x","en":"x"}'::jsonb,'dress','riyadh','active');

-- helper to insert an issued offer with a given starts_at
create or replace function mkoffer(num text, starts timestamptz) returns void language plpgsql as $$
begin
  insert into public.rental_invoices (invoice_number, merchant_id, customer_user_id, subtotal_amount, total_amount, original_item_value, status, starts_at)
  values (num, '77777777-0000-0000-0000-000000000f01','77777777-0000-0000-0000-0000000000a2', 100, 100, 3000, 'issued', starts);
end $$;

-- 1. Yesterday → blocked (P0180)
select traises('1 yesterday blocked', $$select mkoffer('INV-Y', now() - interval '1 day')$$, 'P0180');
-- 2. Earlier today → blocked
select traises('2 earlier today blocked', $$select mkoffer('INV-ET', now() - interval '2 hours')$$, 'P0180');
-- 3 + 11. Exact now boundary (starts_at = now()) → blocked
select traises('3/11 exact-now boundary blocked', $$select mkoffer('INV-NOW', now())$$, 'P0180');
-- 4. One minute future → allowed
select mkoffer('INV-1M', now() + interval '1 minute');
select teq('4 one-minute-future allowed', (select status::text from public.rental_invoices where invoice_number='INV-1M'), 'issued');
-- 5. Tomorrow → allowed
select mkoffer('INV-TM', now() + interval '1 day');
select teq('5 tomorrow allowed', (select status::text from public.rental_invoices where invoice_number='INV-TM'), 'issued');

-- 12. expiry rule = least(now()+1h, starts_at)
--   starts_at within the hour (1 min) → expires_at == starts_at
select teq('12a expiry = starts_at when starts within the hour',
  (select (abs(extract(epoch from (expires_at - starts_at))) < 1)::text from public.rental_invoices where invoice_number='INV-1M'), 'true');
--   starts_at tomorrow → expires_at == now()+1h (≈ capped)
select teq('12b expiry capped at now()+1h when starts far',
  (select (expires_at <= now() + interval '1 hour' + interval '2 seconds' and expires_at > now() + interval '58 minutes')::text
     from public.rental_invoices where invoice_number='INV-TM'), 'true');
-- 13. no immediately-expired offer: expires_at strictly in the future
select teq('13a INV-1M expires in the future', (select (expires_at > now())::text from public.rental_invoices where invoice_number='INV-1M'), 'true');
select teq('13b INV-TM expires in the future', (select (expires_at > now())::text from public.rental_invoices where invoice_number='INV-TM'), 'true');

-- 10. forced API/RPC write with past starts_at (direct table insert) still blocked
select traises('10 forced past write blocked', $$select mkoffer('INV-FORCE', now() - interval '5 minutes')$$, 'P0180');

select '===== START-DATE GUARD TESTS PASSED =====' as r;
