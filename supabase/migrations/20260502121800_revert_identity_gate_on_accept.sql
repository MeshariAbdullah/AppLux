-- =====================================================================
-- Revert: remove the identity_verified gate from accept_rental_invoice
-- =====================================================================
-- The previous migration (20260502121700) introduced a P0004 check
-- that blocked rental invoice acceptance unless the caller's profile
-- was identity_verified. That was a misunderstanding — identity is
-- collected at signup (National ID on the customer profile), not as
-- an extra step inside the rental flow.
--
-- This migration restores accept_rental_invoice to its pre-8e form
-- (the four checks that existed in 20260502121300_split_rental_lifecycle:
--   P0001  invoice not found
--   P0002  not your invoice
--   P0003  invoice not in an acceptable state) — and DROPS the
-- P0004 identity branch. Every other side-effect (contract creation,
-- period derivation, invoice → 'accepted' transition) is unchanged.
--
-- The identity_verified columns from 8e (identity_verified,
-- identity_verified_at, identity_provider, identity_reference_id)
-- and the record_identity_verification RPC are left in place — they
-- don't affect the rental flow and may be reused later.
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

  -- Period length comes from the invoice items (Phase 8d).
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

  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;
