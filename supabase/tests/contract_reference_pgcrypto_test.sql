-- =====================================================================
-- Regression: accept_rental_invoice → next_contract_number →
-- extensions.gen_random_bytes (migration 20260502130500)
-- =====================================================================
-- THE BUG (found live on staging, 2026-10-31): on any database where
-- pgcrypto lives in the `extensions` schema (every current Supabase
-- project), customer acceptance failed with
--     42883: function gen_random_bytes(integer) does not exist
-- because next_contract_number() called it unqualified while being
-- invoked from inside accept_rental_invoice(), a SECURITY DEFINER
-- function pinned to `set search_path = public`.
--
-- This suite exercises the ACTUAL NESTED CALL PATH — a real customer
-- acceptance via accept_rental_invoice() with auth.uid() set — not an
-- isolated call. It must run on a HOSTED-FAITHFUL replica: pgcrypto
-- installed in `extensions` and NOT resolvable from a bare `public`
-- search_path (asserted below; the suite refuses to pass vacuously).
--
-- Run (local replica): pipe into psql with ON_ERROR_STOP; the whole
-- suite runs in one transaction and ROLLS BACK — it leaves no rows.
-- Expected BEFORE 20260502130500: FAILS with 42883 (reproduction).
-- Expected AFTER  20260502130500: '===== ... PASSED =====' banner.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------
-- 0. Preconditions — hosted-faithful extension layout
-- ---------------------------------------------------------------------
do $$
declare v_ns text;
begin
  select n.nspname into v_ns
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_ns is distinct from 'extensions' then
    raise exception 'PRECONDITION: pgcrypto must be installed in schema `extensions` (found %) — rebuild the replica with the hosted-faithful shim, otherwise this test cannot reproduce the bug.', coalesce(v_ns, 'NONE');
  end if;
  -- and it must NOT also be resolvable from public (that would mask the bug)
  if to_regprocedure('public.gen_random_bytes(integer)') is not null then
    raise exception 'PRECONDITION: gen_random_bytes must not exist in schema public.';
  end if;
  raise notice 'precondition ok: pgcrypto only in extensions';
end $$;

-- ---------------------------------------------------------------------
-- 1. Fixture — fictional merchant + customer + issued offer
--    (privileged inserts; the P0195 gate exempts auth.uid() IS NULL by
--    design for seeds/SQL — the gate itself is covered by its own
--    migrations' tests, not this suite)
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaa1111-0000-4000-8000-00000000c2f1',
   'authenticated', 'authenticated', 'c2fix+merchant@lend.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaa2222-0000-4000-8000-00000000c2f2',
   'authenticated', 'authenticated', 'c2fix+customer@lend.test', now(), now());

update public.profiles set role = 'merchant', account_status = 'active',
       full_name = 'C2Fix Merchant', mobile = '500000091'
 where id = 'aaaa1111-0000-4000-8000-00000000c2f1';
update public.profiles set role = 'customer', account_status = 'active',
       full_name = 'C2Fix Customer', mobile = '551110091', national_id = '1011111191'
 where id = 'aaaa2222-0000-4000-8000-00000000c2f2';

insert into public.merchants (id, owner_user_id, company_name, commercial_reg_number, display_name, primary_category, city, status)
values ('aaaa3333-0000-4000-8000-00000000c2f3', 'aaaa1111-0000-4000-8000-00000000c2f1',
        'C2Fix Trading', 'CR-1010000091', '{"ar":"متجر اختبار الإصلاح","en":"C2Fix Store"}'::jsonb,
        'dress', 'الرياض', 'active');

insert into public.rental_invoices
  (id, invoice_number, merchant_id, customer_user_id, status,
   subtotal_amount, tax_amount, total_amount, original_item_value,
   lessee_national_id, expires_at)
values
  ('aaaa4444-0000-4000-8000-00000000c2f4', 'INV-TEST-C2FIX-1',
   'aaaa3333-0000-4000-8000-00000000c2f3', 'aaaa2222-0000-4000-8000-00000000c2f2',
   'issued', 1200.00, 0, 1200.00, 4800.00, '1011111191', now() + interval '1 hour');

insert into public.rental_invoice_items (invoice_id, position, item_name, category, daily_rate, rental_days, subtotal)
values ('aaaa4444-0000-4000-8000-00000000c2f4', 0, 'فستان اختبار الإصلاح', 'dress', 0, 7, 1200.00);

-- ---------------------------------------------------------------------
-- 2. THE NESTED PATH — accept as the customer (auth.uid() set), which
--    drives accept_rental_invoice → next_contract_number →
--    extensions.gen_random_bytes under the pinned public search_path.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'aaaa2222-0000-4000-8000-00000000c2f2', true);

do $$
declare
  v_contract_id uuid;
  v_ref  text;
  v_note int;
  v_inv  text;
begin
  v_contract_id := public.accept_rental_invoice('aaaa4444-0000-4000-8000-00000000c2f4');

  select contract_number into v_ref from public.rental_contracts where id = v_contract_id;
  if v_ref !~ '^LND-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'FAIL: contract reference % does not match the LND format', v_ref;
  end if;
  raise notice 'ok: contract created with reference %', v_ref;

  select status::text into v_inv from public.rental_invoices
   where id = 'aaaa4444-0000-4000-8000-00000000c2f4';
  if v_inv <> 'accepted' then
    raise exception 'FAIL: invoice status % (expected accepted)', v_inv;
  end if;
  raise notice 'ok: invoice accepted';

  -- Current phase (20260502122400, ENABLE_PAYMENTS_AND_NOTES=false):
  -- acceptance creates the PENDING contract and NO promissory-note row
  -- (notes belong to the dormant payments-enabled path).
  if (select status::text from public.rental_contracts where id = v_contract_id) <> 'pending' then
    raise exception 'FAIL: contract not pending after acceptance';
  end if;
  select count(*) into v_note from public.promissory_notes where contract_id = v_contract_id;
  if v_note <> 0 then
    raise exception 'FAIL: expected 0 note rows in the simplified phase, found %', v_note;
  end if;
  raise notice 'ok: pending contract, no note rows (simplified phase)';

  -- Continue the real journey: pickup photos (required gate, 122900)
  -- then the simulated-phase activation.
  insert into public.contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (v_contract_id, 'aaaa2222-0000-4000-8000-00000000c2f2',
          'receipts/' || v_contract_id || '/c2fix-test.png');
  perform public.confirm_contract_receipt_photos(v_contract_id);
  perform public.activate_rental_without_payment_and_note(v_contract_id);
  if (select status::text from public.rental_contracts where id = v_contract_id) <> 'active' then
    raise exception 'FAIL: contract not active after activation';
  end if;
  if (select used_amount from public.rental_eligibility
       where user_id = 'aaaa2222-0000-4000-8000-00000000c2f2') <> 4800.00 then
    raise exception 'FAIL: used_amount not committed to the 4800 exposure at activation';
  end if;
  raise notice 'ok: activation committed eligibility (used_amount = 4800)';
end $$;

-- ---------------------------------------------------------------------
-- 3. Isolated sanity: the generator itself under a bare public path
--    (what the pinned SECURITY DEFINER context effectively provides)
-- ---------------------------------------------------------------------
do $$
declare v text;
begin
  perform set_config('search_path', 'public', true);
  v := public.next_contract_number();
  if v !~ '^LND-' then raise exception 'FAIL: generator returned %', v; end if;
  raise notice 'ok: next_contract_number works under bare public search_path';
end $$;

-- ---------------------------------------------------------------------
-- 4. Definition guard: the fix stays schema-qualified
-- ---------------------------------------------------------------------
do $$
begin
  if position('extensions.gen_random_bytes' in
       (select pg_get_functiondef(p.oid) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'next_contract_number')) = 0 then
    raise exception 'FAIL: next_contract_number no longer schema-qualifies gen_random_bytes';
  end if;
  raise notice 'ok: definition schema-qualified';
end $$;

rollback;  -- fixture leaves no trace
\echo ===== contract_reference_pgcrypto_test PASSED =====
