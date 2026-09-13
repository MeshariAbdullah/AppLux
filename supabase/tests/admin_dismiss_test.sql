-- Admin administrative closure end-to-end (124900 + the 20260502130000
-- vocabulary repair). Run with psql against a database with ALL
-- migrations applied (never production).
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
  ('33333333-0000-0000-0000-0000000000a1','dis-own@e.sa'),
  ('33333333-0000-0000-0000-0000000000a2','dis-cust@e.sa'),
  ('33333333-0000-0000-0000-0000000000a3','dis-admin@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status) values
  ('33333333-0000-0000-0000-0000000000a1','Own','dis-own@e.sa','merchant','active'),
  ('33333333-0000-0000-0000-0000000000a2','Cust','dis-cust@e.sa','customer','active'),
  ('33333333-0000-0000-0000-0000000000a3','Adm','dis-admin@e.sa','admin','active')
  on conflict (id) do update set role = excluded.role;
insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status)
  values ('33333333-0000-0000-0000-000000000f01','33333333-0000-0000-0000-0000000000a1','Co','DIS-1','{"ar":"x","en":"x"}'::jsonb,'dress','riyadh','active')
  on conflict (id) do nothing;
insert into public.rental_invoices (id, invoice_number, merchant_id, customer_user_id, subtotal_amount, total_amount, original_item_value, status, starts_at)
  values ('33333333-0000-0000-0000-00000000ee01','INV-DIS-1','33333333-0000-0000-0000-000000000f01','33333333-0000-0000-0000-0000000000a2',100,100,3000,'accepted', now());
insert into public.rental_contracts (id, contract_number, invoice_id, customer_user_id, merchant_id, start_date, end_date, rental_fee_amount, total_amount, original_item_value, status)
  values ('33333333-0000-0000-0000-00000000cc01','CN-DIS-1','33333333-0000-0000-0000-00000000ee01','33333333-0000-0000-0000-0000000000a2','33333333-0000-0000-0000-000000000f01',current_date,current_date+3,100,100,3000,'active');
insert into public.damage_cases (id, case_number, contract_id, customer_user_id, merchant_id, raised_by_user_id, severity, claim_amount, description)
  values ('33333333-0000-0000-0000-00000000dd01','DC-DIS-1','33333333-0000-0000-0000-00000000cc01','33333333-0000-0000-0000-0000000000a2','33333333-0000-0000-0000-000000000f01','33333333-0000-0000-0000-0000000000a1','partial',500,'dismiss test');

select set_config('request.jwt.claims', json_build_object('sub','33333333-0000-0000-0000-0000000000a3','role','authenticated')::text, true) \gset

-- 1. Server-side reason guard.
select traises('1 empty reason refused (P0221)',
  $q$select public.admin_dismiss_dispute_case('33333333-0000-0000-0000-00000000dd01', '  ')$q$, 'P0221');

-- 2. Dismissal succeeds end-to-end with the restored vocabulary
--    (case_dismissed_by_lend event + dispute_dismissed notifications).
select public.admin_dismiss_dispute_case('33333333-0000-0000-0000-00000000dd01', 'سبب إداري محايد');
select teq('2a case closed administratively',
  (select dispute_phase::text || '/' || dispute_outcome::text || '/' || resolution_notes
     from damage_cases where id = '33333333-0000-0000-0000-00000000dd01'),
  'resolved/dismissed/سبب إداري محايد');
select teq('2b dismissal event recorded (restored CHECK value)',
  (select count(*)::text from dispute_events
    where case_id = '33333333-0000-0000-0000-00000000dd01'
      and event_type = 'case_dismissed_by_lend'), '1');
select teq('2c both parties notified (restored notification type)',
  (select count(*)::text from notifications
    where case_id = '33333333-0000-0000-0000-00000000dd01'
      and type = 'dispute_dismissed'), '2');
select teq('2d each notification fanned out one push job',
  (select count(*)::text from push_jobs pj
     join notifications n on n.id = pj.notification_id
    where n.case_id = '33333333-0000-0000-0000-00000000dd01'
      and n.type = 'dispute_dismissed'), '2');

-- 3. Already-closed case: dismissal refused; non-admins refused.
select traises('3a already-closed case refused (P0201)',
  $q$select public.admin_dismiss_dispute_case('33333333-0000-0000-0000-00000000dd01', 'x')$q$, 'P0201');
select set_config('request.jwt.claims', json_build_object('sub','33333333-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select traises('3b non-admin refused (P0211)',
  $q$select public.admin_dismiss_dispute_case('33333333-0000-0000-0000-00000000dd01', 'x')$q$, 'P0211');

rollback;
