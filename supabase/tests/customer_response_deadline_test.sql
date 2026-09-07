-- Tests for 20260502125400_customer_response_deadline.sql
-- Run with psql against a database that has ALL migrations applied
-- (never production). Style matches the other supabase/tests files.
\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

begin;

-- fixtures: merchant owner + customer + merchant
insert into auth.users (id, email) values
  ('88888888-0000-0000-0000-0000000000a1','crd-own@e.sa'),
  ('88888888-0000-0000-0000-0000000000a2','crd-cust@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status) values
  ('88888888-0000-0000-0000-0000000000a1','Own','crd-own@e.sa','merchant','active'),
  ('88888888-0000-0000-0000-0000000000a2','Cust','crd-cust@e.sa','customer','active')
  on conflict (id) do nothing;
insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status)
  values ('88888888-0000-0000-0000-000000000f01','88888888-0000-0000-0000-0000000000a1','Co','CRD-1','{"ar":"x","en":"x"}'::jsonb,'dress','riyadh','active')
  on conflict (id) do nothing;

-- helper: one active contract (+invoice) and an open case on it
create or replace function crd_mkcase(seq int) returns uuid language plpgsql as $$
declare v_inv uuid; v_con uuid; v_case uuid;
begin
  insert into public.rental_invoices (invoice_number, merchant_id, customer_user_id, subtotal_amount, total_amount, original_item_value, status, starts_at)
  values ('INV-CRD-'||seq, '88888888-0000-0000-0000-000000000f01','88888888-0000-0000-0000-0000000000a2', 100, 100, 3000, 'accepted', now() + interval '1 day')
  returning id into v_inv;
  insert into public.rental_contracts (contract_number, invoice_id, customer_user_id, merchant_id, start_date, end_date, rental_fee_amount, total_amount, status)
  values ('CN-CRD-'||seq, v_inv, '88888888-0000-0000-0000-0000000000a2','88888888-0000-0000-0000-000000000f01', current_date, current_date+3, 100, 100, 'active')
  returning id into v_con;
  insert into public.damage_cases (case_number, contract_id, customer_user_id, merchant_id, raised_by_user_id, severity, claim_amount, description)
  values ('DC-CRD-'||seq, v_con, '88888888-0000-0000-0000-0000000000a2','88888888-0000-0000-0000-000000000f01','88888888-0000-0000-0000-0000000000a1','partial', 500, 'test')
  returning id into v_case;
  return v_case;
end $$;

-- 1. New claim gets a 48h deadline + the deadline_set event.
select crd_mkcase(1) as c1 \gset
select teq('1a deadline stamped ~48h',
  (select (customer_response_deadline between now() + interval '47 hours' and now() + interval '49 hours')::text
     from damage_cases where id = :'c1'), 'true');
select teq('1b deadline_set event written',
  (select exists(select 1 from dispute_events where case_id = :'c1'
                  and event_type = 'customer_response_deadline_set')::text), 'true');

-- 2. In-window response keeps the EXISTING flow (objection → direct_settlement).
select set_config('request.jwt.claims', json_build_object('sub','88888888-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select public.customer_object_to_claim(:'c1', 'أعترض');
select teq('2 in-window objection → direct_settlement',
  (select dispute_phase::text from damage_cases where id = :'c1'), 'direct_settlement');

-- 3. Overdue case: late responses refused with P0212 (accept AND object).
-- (Clear the JWT first: fixture creation must run in the service
-- context, outside the merchant-OTP issuance gate.)
select set_config('request.jwt.claims', '', true) \gset
select crd_mkcase(2) as c2 \gset
select set_config('request.jwt.claims', json_build_object('sub','88888888-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
update damage_cases set customer_response_deadline = now() - interval '1 hour' where id = :'c2';
select traises('3a late accept refused', format('select public.customer_accept_claim(%L)', :'c2'), 'P0212');
select traises('3b late objection refused', format('select public.customer_object_to_claim(%L, %L)', :'c2', 'x'), 'P0212');

-- 4. Sweeper escalates ONLY the overdue awaiting case (service context).
select set_config('request.jwt.claims', '', true) \gset
select teq('4a sweeper escalated exactly one case',
  (select public.process_overdue_customer_responses()::text), '1');
select teq('4b non-response documented',
  (select (customer_no_response_recorded_at is not null)::text from damage_cases where id = :'c2'), 'true');
select teq('4c case moved to Lend review',
  (select dispute_phase::text from damage_cases where id = :'c2'), 'lend_mediation');
select teq('4d legacy status untouched (still open, NOT settled)',
  (select status::text from damage_cases where id = :'c2'), 'open');
select teq('4e contract untouched (silence resolves nothing)',
  (select rc.status::text from rental_contracts rc join damage_cases dc on dc.contract_id = rc.id where dc.id = :'c2'), 'active');
select teq('4f no_response event written',
  (select exists(select 1 from dispute_events where case_id = :'c2'
                  and event_type = 'customer_no_response_recorded')::text), 'true');
select teq('4g moved event carries the reason',
  (select metadata->>'reason' from dispute_events where case_id = :'c2'
    and event_type = 'moved_to_lend_mediation' order by created_at desc limit 1), 'customer_no_response');
select teq('4h merchant + customer notified',
  (select (count(*) >= 2)::text from notifications
    where case_id = :'c2' and type = 'dispute_customer_no_response'
      and user_id in ('88888888-0000-0000-0000-0000000000a1','88888888-0000-0000-0000-0000000000a2')), 'true');

-- 5. Merchant-pending case is NEVER treated as customer non-response:
--    c1 sits in direct_settlement (customer responded; ball can be on
--    the merchant's side) with a stale deadline — the sweeper must
--    skip it.
update damage_cases set customer_response_deadline = now() - interval '3 days' where id = :'c1';
select teq('5a sweeper skips non-awaiting case',
  (select public.process_overdue_customer_responses()::text), '0');
select teq('5b merchant-pending phase unchanged',
  (select dispute_phase::text from damage_cases where id = :'c1'), 'direct_settlement');

-- 6. Legacy case without a deadline: never auto-escalated, customer
--    can still respond (pre-migration behavior preserved).
select crd_mkcase(3) as c3 \gset
update damage_cases set customer_response_deadline = null where id = :'c3';
select teq('6a sweeper ignores NULL-deadline case',
  (select public.process_overdue_customer_responses()::text), '0');
select set_config('request.jwt.claims', json_build_object('sub','88888888-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select public.customer_accept_claim(:'c3');
select teq('6b legacy case customer response still works',
  (select dispute_outcome::text from damage_cases where id = :'c3'), 'claim_accepted');

-- 7. Idempotency: re-sweeping finds nothing.
select set_config('request.jwt.claims', '', true) \gset
select teq('7 second sweep is a no-op',
  (select public.process_overdue_customer_responses()::text), '0');

rollback;
