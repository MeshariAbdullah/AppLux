-- =====================================================================
-- Rental start date/time on the invoice
-- =====================================================================
-- The merchant wizard now supports setting the rental start date +
-- time at invoice-issue time (previously the contract's start_date
-- was always today, decided at the customer's acceptance moment).
--
-- What this migration does:
--   (1) Adds a nullable `starts_at timestamptz` column to
--       rental_invoices. `null` = existing behaviour (contract
--       start_date = current_date when the customer accepts).
--       Non-null = the merchant's chosen moment; the contract's
--       start_date will be `starts_at::date`.
--   (2) Replaces public.accept_rental_invoice with a version that
--       reads the new column and honours it. The RPC's signature,
--       error codes (P0001/P0002/P0003), and every other side
--       effect (contract number, invoice→'accepted', rental_days
--       derivation) are byte-identical to the previous
--       20260502121800 version. Only the `v_start_date` local
--       changes — it's `coalesce(v_invoice.starts_at::date,
--       current_date)`, so any invoice created before this
--       migration keeps the old behaviour.
--
-- Downstream:
--   * Nafath / Nafith / promissory note flow — unchanged; those
--     read the contract row after creation, and only the numeric
--     values of start_date/end_date shift.
--   * Payment flow — unchanged; no field consumed by
--     record_rental_payment / verify_and_activate_rental changes.
--   * Customer sign-up + eligibility — unchanged.
--
-- Rollback (do not paste inline — for future reference):
--   alter table public.rental_invoices drop column starts_at;
--   -- and re-apply the 20260502121800 body of accept_rental_invoice.
-- =====================================================================

alter table public.rental_invoices
  add column if not exists starts_at timestamptz;

comment on column public.rental_invoices.starts_at is
  'Merchant-set rental start moment. When non-null, accept_rental_invoice uses starts_at::date as the contract''s start_date (end_date = start_date + rental_days). Null = legacy behaviour (contract start = current_date at acceptance).';

-- ---------------------------------------------------------------------
-- accept_rental_invoice — honour rental_invoices.starts_at when set.
-- ---------------------------------------------------------------------
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

  v_contract_number := next_contract_number();

  -- Period length comes from the invoice items (unchanged).
  select max(rental_days) into v_rental_days
  from rental_invoice_items
  where invoice_id = v_invoice.id;
  v_rental_days := coalesce(v_rental_days, 30);

  -- NEW: prefer the merchant-set start when present. Cast down to
  -- a date because rental_contracts.start_date is a date, not a
  -- timestamptz — the invoice keeps time-of-day for display, but
  -- the contract layer is day-granular.
  v_start_date := coalesce(v_invoice.starts_at::date, current_date);

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    v_start_date,
    v_start_date + (v_rental_days || ' days')::interval,
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount,
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
