-- =====================================================================
-- Contract party identity snapshots + acceptance guard
-- =====================================================================
-- AUDIT (reported): rental_contracts stored NO party identity — the
-- review step and post-approval screens read LIVE merchant/profile
-- rows, so a later profile or company rename would silently change
-- what an approved contract appears to say, and acceptance could
-- complete even when the customer had no National ID on file or the
-- merchant CR was blank. No generated PDF exists in the product.
--
-- This migration:
--   1. Adds four snapshot columns to rental_contracts, captured AT
--      ACCEPTANCE inside accept_rental_invoice (same transaction as
--      the contract insert):
--        lessor_legal_name    ← merchants.company_name (legal name;
--                               display_name stays the boutique brand)
--        lessor_cr_number     ← merchants.commercial_reg_number
--        lessee_legal_name    ← profiles.full_name
--        lessee_national_id   ← profiles.national_id
--   2. Replaces accept_rental_invoice (same signature — no client
--      change needed) so acceptance FAILS with errcode P0150 when any
--      of the four identifiers is missing/blank. No fake values are
--      ever written.
--
-- Existing contracts are NOT rewritten — their snapshot columns stay
-- NULL and the UI falls back to live data for those legacy rows.
--
-- Privacy: the snapshot columns live on rental_contracts, which RLS
-- already restricts to the contract's own customer, its merchant
-- owner, and admins — the same audience that may see contracting-
-- party identifiers. No new policies required; URL manipulation by
-- another customer still returns zero rows.
--
-- Idempotent. ROLLBACK: re-apply the 20260502122200 body of
-- accept_rental_invoice; the columns are additive and may stay.
-- =====================================================================

alter table public.rental_contracts
  add column if not exists lessor_legal_name  text,
  add column if not exists lessor_cr_number   text,
  add column if not exists lessee_legal_name  text,
  add column if not exists lessee_national_id text;

create or replace function public.accept_rental_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice          rental_invoices%rowtype;
  v_contract_id      uuid;
  v_contract_number  text;
  v_rental_days      int;
  v_start_date       date;
  v_lessor_name      text;
  v_lessor_cr        text;
  v_lessee_name      text;
  v_lessee_nid       text;
begin
  select * into v_invoice from rental_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001';
  end if;

  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only accept your own invoice' using errcode = 'P0002';
  end if;

  if v_invoice.status not in ('issued', 'viewed') then
    raise exception 'Invoice is not in an acceptable state (got %)', v_invoice.status
      using errcode = 'P0003';
  end if;

  -- Party identity snapshots — required to form the contract. Missing
  -- data blocks acceptance (P0150); nothing is fabricated.
  select company_name, commercial_reg_number
    into v_lessor_name, v_lessor_cr
    from merchants where id = v_invoice.merchant_id;
  select full_name, national_id
    into v_lessee_name, v_lessee_nid
    from profiles where id = v_invoice.customer_user_id;

  if coalesce(trim(v_lessor_name), '') = ''
     or coalesce(trim(v_lessor_cr), '') = ''
     or coalesce(trim(v_lessee_name), '') = ''
     or coalesce(trim(v_lessee_nid), '') = '' then
    raise exception 'Contract party identity details are incomplete'
      using errcode = 'P0150';
  end if;

  v_contract_number := next_contract_number();

  -- Period length comes from the invoice items (unchanged).
  select max(rental_days) into v_rental_days
  from rental_invoice_items
  where invoice_id = v_invoice.id;
  v_rental_days := coalesce(v_rental_days, 30);

  -- Prefer the merchant-set start when present (20260502122200).
  v_start_date := coalesce(v_invoice.starts_at::date, current_date);

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    lessor_legal_name, lessor_cr_number, lessee_legal_name, lessee_national_id,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    v_start_date,
    v_start_date + (v_rental_days || ' days')::interval,
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount,
    trim(v_lessor_name), trim(v_lessor_cr), trim(v_lessee_name), trim(v_lessee_nid),
    'pending', null
  )
  returning id into v_contract_id;

  update rental_invoices
  set status = 'accepted', updated_at = now()
  where id = p_invoice_id;

  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;

comment on function public.accept_rental_invoice(uuid) is
  'Customer accepts an issued/viewed invoice → creates the pending contract with LND reference and party identity snapshots (lessor legal name/CR, lessee legal name/National ID) captured at acceptance. P0150 when any identifier is missing; P0001/P0002/P0003 unchanged.';

notify pgrst, 'reload schema';
