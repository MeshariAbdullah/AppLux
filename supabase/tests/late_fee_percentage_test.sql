-- Tests for 20260502130100_late_fee_percentage.sql
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
  ('55555555-0000-0000-0000-0000000000a1','late-own@e.sa'),
  ('55555555-0000-0000-0000-0000000000a2','late-cust@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, account_status) values
  ('55555555-0000-0000-0000-0000000000a1','Own','late-own@e.sa','merchant','active'),
  ('55555555-0000-0000-0000-0000000000a2','Cust','late-cust@e.sa','customer','active')
  on conflict (id) do nothing;
insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status)
  values ('55555555-0000-0000-0000-000000000f01','55555555-0000-0000-0000-0000000000a1','Co','LATE-1','{"ar":"x","en":"x"}'::jsonb,'dress','riyadh','active')
  on conflict (id) do nothing;

create or replace function late_mkinv(seq int, p_pricing text, p_late_type text, p_mult numeric, p_fixed numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.rental_invoices
    (invoice_number, merchant_id, customer_user_id, subtotal_amount, total_amount,
     original_item_value, pricing_type, late_fee_type, late_return_multiplier,
     late_fee_fixed_amount, status, starts_at)
  values ('INV-LATE-'||seq, '55555555-0000-0000-0000-000000000f01',
          '55555555-0000-0000-0000-0000000000a2', 300, 300, 3000,
          p_pricing, p_late_type, p_mult, p_fixed, 'issued', now() + interval '1 day')
  returning id into v;
  return v;
end $$;

-- 1. Percentage rows: fraction stored, both pricing models accepted.
select late_mkinv(1, 'daily', 'percentage', 0.20, null) as i1 \gset
select teq('1a percentage row accepted (daily pricing, 20%)',
  (select late_fee_type || '/' || trim_scale(late_return_multiplier)::text
     from rental_invoices where id = :'i1'), 'percentage/0.2');
select late_mkinv(2, 'total', 'percentage', 0.10, null) as i2 \gset
select teq('1b percentage row accepted under TOTAL pricing',
  (select late_fee_type from rental_invoices where id = :'i2'), 'percentage');

-- 2. Percentage bounds: the rate must be explicit and in (0, 1].
select traises('2a percentage above 100% rejected',
  $q$select late_mkinv(3, 'daily', 'percentage', 1.5, null)$q$, '23514');
select traises('2b zero percentage rejected',
  $q$select late_mkinv(4, 'daily', 'percentage', 0, null)$q$, '23514');

-- 3. Fixed mode unchanged; legacy multiplier still valid for daily —
--    and still forbidden under total pricing.
select late_mkinv(5, 'total', 'fixed', 1.5, 100) as i5 \gset
select teq('3a fixed under total pricing still works',
  (select trim_scale(late_fee_fixed_amount)::text from rental_invoices where id = :'i5'), '100');
select late_mkinv(6, 'daily', 'multiplier', 1.5, null) as i6 \gset
select teq('3b legacy multiplier rows still insert (historical shape)',
  (select late_fee_type from rental_invoices where id = :'i6'), 'multiplier');
select traises('3c multiplier under total pricing still rejected',
  $q$select late_mkinv(7, 'total', 'multiplier', 1.5, null)$q$, '23514');

rollback;
