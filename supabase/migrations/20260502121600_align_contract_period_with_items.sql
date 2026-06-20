-- =====================================================================
-- Phase 8d — align contract period with invoice items
-- =====================================================================
-- accept_rental_invoice used to hardcode the contract period as
-- `current_date .. current_date + 30 days` regardless of what the
-- merchant actually quoted on the invoice items. For any rental
-- whose items.rental_days != 30, the resulting contract.end_date
-- was wrong, which then caused the contract page's Key Terms
-- duration (computed from start/end dates) to diverge from the
-- clauses panel's duration (which reads items[0].rental_days
-- directly).
--
-- This migration replaces accept_rental_invoice so the contract
-- end_date is computed from MAX(items.rental_days). MAX is used
-- (rather than e.g. first item) so a multi-item invoice where
-- different items have different periods resolves to the latest
-- return date — the rental as a whole isn't done until the longest-
-- period item is back.
--
-- No data backfill: existing contract rows keep their previous
-- (potentially wrong) end_date. New contracts created from this
-- point follow the corrected logic.
-- =====================================================================

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

  -- Period length comes from the invoice items, not a hardcoded 30.
  -- MAX so a multi-item invoice resolves to the latest return date.
  -- Fallback to 30 only when there are no items yet (defensive).
  select max(rental_days) into v_rental_days
  from rental_invoice_items
  where invoice_id = v_invoice.id;
  v_rental_days := coalesce(v_rental_days, 30);

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    current_date,
    current_date + (v_rental_days || ' days')::interval,
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount,
    'pending', null
  )
  returning id into v_contract_id;

  update rental_invoices
  set status = 'accepted', updated_at = now()
  where id = p_invoice_id;

  -- Note is NOT created here (payment hasn't happened).
  -- Eligibility is NOT bumped here (rental isn't active yet).
  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;
