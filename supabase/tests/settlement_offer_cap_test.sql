-- Tests for 20260502125900_settlement_offer_cap.sql
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

-- Seed: merchant owner + customer + admin, one merchant.
insert into auth.users (id, email) values
  ('77777777-0000-0000-0000-0000000000a1','cap-own@e.sa'),
  ('77777777-0000-0000-0000-0000000000a2','cap-cust@e.sa'),
  ('77777777-0000-0000-0000-0000000000a3','cap-admin@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status) values
  ('77777777-0000-0000-0000-0000000000a1','Own','cap-own@e.sa','merchant','active'),
  ('77777777-0000-0000-0000-0000000000a2','Cust','cap-cust@e.sa','customer','active'),
  ('77777777-0000-0000-0000-0000000000a3','Adm','cap-admin@e.sa','admin','active')
  on conflict (id) do update set role = excluded.role;
insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status)
  values ('77777777-0000-0000-0000-000000000f01','77777777-0000-0000-0000-0000000000a1','Co','CAP-1','{"ar":"x","en":"x"}'::jsonb,'dress','riyadh','active')
  on conflict (id) do nothing;

-- Fixture: contract (+invoice) with a 3,000 original item value and an
-- open case moved to direct_settlement via the real objection RPC.
create or replace function cap_mkcase(seq int, p_contract_item numeric, p_invoice_item numeric)
returns uuid language plpgsql as $$
declare v_inv uuid; v_con uuid; v_case uuid;
begin
  insert into public.rental_invoices (invoice_number, merchant_id, customer_user_id, subtotal_amount, total_amount, original_item_value, status, starts_at)
  values ('INV-CAP-'||seq, '77777777-0000-0000-0000-000000000f01','77777777-0000-0000-0000-0000000000a2', 100, 100, p_invoice_item, 'accepted', now() + interval '1 day')
  returning id into v_inv;
  insert into public.rental_contracts (contract_number, invoice_id, customer_user_id, merchant_id, start_date, end_date, rental_fee_amount, total_amount, original_item_value, status)
  values ('CN-CAP-'||seq, v_inv, '77777777-0000-0000-0000-0000000000a2','77777777-0000-0000-0000-000000000f01', current_date, current_date+3, 100, 100, p_contract_item, 'active')
  returning id into v_con;
  insert into public.damage_cases (case_number, contract_id, customer_user_id, merchant_id, raised_by_user_id, severity, claim_amount, description)
  values ('DC-CAP-'||seq, v_con, '77777777-0000-0000-0000-0000000000a2','77777777-0000-0000-0000-000000000f01','77777777-0000-0000-0000-0000000000a1','partial', 500, 'cap test')
  returning id into v_case;
  return v_case;
end $$;

-- 1. Cap source: contract value wins; invoice value is the fallback.
select cap_mkcase(1, 3000, 9999) as c1 \gset
select teq('1a cap = contract original_item_value',
  (select trim_scale(public.settlement_offer_cap(contract_id))::text from damage_cases where id = :'c1'), '3000');
-- (contract value 0 = the legacy 'unset' convention → invoice fallback)
select cap_mkcase(2, 0, 2500) as c2 \gset
select teq('1b cap falls back to invoice original_item_value',
  (select trim_scale(public.settlement_offer_cap(contract_id))::text from damage_cases where id = :'c2'), '2500');

-- Move case 1 to direct_settlement through the real customer RPC.
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select public.customer_object_to_claim(:'c1', 'أعترض');
select teq('2 objection still works → direct_settlement',
  (select dispute_phase::text from damage_cases where id = :'c1'), 'direct_settlement');

-- 3. Merchant proposals: over cap refused, zero/negative refused.
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select traises('3a over-cap proposal refused (P0213)',
  format($q$select public.submit_settlement_proposal(%L, 3500, null)$q$, :'c1'), 'P0213');
select traises('3b zero proposal refused (P0210)',
  format($q$select public.submit_settlement_proposal(%L, 0, null)$q$, :'c1'), 'P0210');
select traises('3c negative proposal refused (P0210)',
  format($q$select public.submit_settlement_proposal(%L, -5, null)$q$, :'c1'), 'P0210');

-- 4. Exactly-at-cap proposal works; rounds logic intact end-to-end.
select public.submit_settlement_proposal(:'c1', 3000, 'round 1') as p1 \gset
select teq('4a at-cap proposal accepted as round 1',
  (select round::text from dispute_settlement_proposals where id = :'p1'), '1');
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select public.respond_to_settlement_proposal(:'p1', false);
select teq('4b rejection recorded',
  (select status::text from dispute_settlement_proposals where id = :'p1'), 'rejected');
-- Customer counter-offer (round 2), then merchant accepts → resolved.
select public.submit_settlement_proposal(:'c1', 500, 'round 2') as p2 \gset
select teq('4c customer counter is round 2',
  (select round::text from dispute_settlement_proposals where id = :'p2'), '2');
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a1','role','authenticated')::text, true) \gset
select public.respond_to_settlement_proposal(:'p2', true);
select teq('4d under-cap acceptance resolves the case',
  (select dispute_phase::text || '/' || dispute_outcome::text || '/' || trim_scale(agreed_amount)::text
     from damage_cases where id = :'c1'), 'resolved/direct_settlement/500');

-- 5. Legacy over-cap proposal (forged past the RPC): accepting is
--    refused, rejecting still works; the stored amount is untouched.
select set_config('request.jwt.claims', '', true);
select cap_mkcase(3, 3000, 3000) as c3 \gset
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select public.customer_object_to_claim(:'c3', 'أعترض');
select set_config('request.jwt.claims', '', true);
insert into public.dispute_settlement_proposals (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount)
values (:'c3', 'direct', 1, 'merchant', '77777777-0000-0000-0000-0000000000a1', 9000)
returning id as p3 \gset
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select traises('5a accepting a legacy over-cap proposal refused (P0213)',
  format($q$select public.respond_to_settlement_proposal(%L, true)$q$, :'p3'), 'P0213');
select teq('5b legacy amount NOT modified',
  (select trim_scale(amount)::text from dispute_settlement_proposals where id = :'p3'), '9000');
select public.respond_to_settlement_proposal(:'p3', false);
select teq('5c rejecting the over-cap proposal still works',
  (select status::text from dispute_settlement_proposals where id = :'p3'), 'rejected');

-- 6. Lend mediation: same cap for the admin proposal.
select set_config('request.jwt.claims', '', true);
select cap_mkcase(4, 3000, 3000) as c4 \gset
update public.damage_cases set dispute_phase = 'lend_mediation' where id = :'c4';
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a3','role','authenticated')::text, true) \gset
select traises('6a over-cap Lend proposal refused (P0213)',
  format($q$select public.lend_submit_mediation_proposal(%L, 3500, null)$q$, :'c4'), 'P0213');
select traises('6b zero Lend proposal refused (P0210)',
  format($q$select public.lend_submit_mediation_proposal(%L, 0, null)$q$, :'c4'), 'P0210');
select public.lend_submit_mediation_proposal(:'c4', 1200, null) as p4 \gset
select teq('6c valid Lend proposal accepted',
  (select trim_scale(amount)::text from dispute_settlement_proposals where id = :'p4'), '1200');

-- 7. Legacy over-cap Lend proposal: acceptance refused for a party.
select set_config('request.jwt.claims', '', true);
select cap_mkcase(5, 3000, 3000) as c5 \gset
update public.damage_cases set dispute_phase = 'lend_mediation' where id = :'c5';
insert into public.dispute_settlement_proposals (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount)
values (:'c5', 'lend', null, 'lend', '77777777-0000-0000-0000-0000000000a3', 8000);
select set_config('request.jwt.claims', json_build_object('sub','77777777-0000-0000-0000-0000000000a2','role','authenticated')::text, true) \gset
select traises('7 accepting a legacy over-cap Lend proposal refused (P0213)',
  format($q$select public.respond_to_lend_proposal(%L, true)$q$, :'c5'), 'P0213');

rollback;
