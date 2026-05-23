-- =====================================================================
-- AppLux MVP — domain correction: original item value
-- =====================================================================
-- Splits the conflated "rental fee + collateral" concept into two
-- distinct values on the invoice and contract records, and pivots the
-- promissory note principal + eligibility math onto the new value.
--
--   * rental_invoices.original_item_value   (new)
--   * rental_contracts.original_item_value  (new)
--
-- After this migration:
--   * accept_rental_invoice
--       - promissory_notes.principal_amount = invoice.original_item_value
--       - rental_eligibility.used_amount bumped by original_item_value
--   * close_rental_contract
--       - rental_eligibility.used_amount decremented by original_item_value
--   * on_damage_case_inserted
--       - rental_eligibility.used_amount decremented by original_item_value
--
-- The legacy `security_deposit` column is left in place (defaults to 0)
-- so existing rows + the older MerchantInvoiceNew form keep working;
-- nothing in the new note-principal / eligibility math reads it any more.
-- =====================================================================

alter table public.rental_invoices
  add column if not exists original_item_value numeric(12,2) not null default 0;
alter table public.rental_contracts
  add column if not exists original_item_value numeric(12,2) not null default 0;

-- Backfill: when a row pre-dates this migration its original_item_value
-- defaulted to 0; if we wanted to retroactively map total_amount into the
-- new column we'd do it here. Leaving as 0 since the previous semantics
-- weren't actually "item value" — they were rental fee + collateral.

-- ---------------------------------------------------------------------
-- accept_rental_invoice — pivots note principal + eligibility bump
-- onto the new original_item_value
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
  v_note_id          uuid;
  v_contract_number  text;
  v_note_number      text;
  v_beneficiary      text;
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
  v_note_number     := next_note_number();

  select company_name into v_beneficiary
  from merchants
  where id = v_invoice.merchant_id;

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount, original_item_value,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    current_date, current_date + interval '30 days',
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount, v_invoice.original_item_value,
    'active', now()
  )
  returning id into v_contract_id;

  insert into promissory_notes (
    reference_number, contract_id, customer_user_id, merchant_id,
    beneficiary_name, principal_amount, due_date,
    status, signed_at
  )
  values (
    v_note_number, v_contract_id, v_invoice.customer_user_id, v_invoice.merchant_id,
    coalesce(v_beneficiary, 'AppLux Partner'),
    v_invoice.original_item_value,                      -- CHANGED: was total + deposit
    current_date + interval '60 days',
    'signed', now()
  )
  returning id into v_note_id;

  update rental_invoices
  set status = 'accepted', updated_at = now()
  where id = p_invoice_id;

  -- Bump eligibility by the original item value (NOT the rental fee).
  update rental_eligibility
  set used_amount = least(used_amount + v_invoice.original_item_value, limit_amount),
      updated_at = now()
  where user_id = v_invoice.customer_user_id;

  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- close_rental_contract — eligibility decrement pivots onto
-- original_item_value too
-- ---------------------------------------------------------------------

create or replace function public.close_rental_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
begin
  select * into v_contract from rental_contracts where id = p_contract_id;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0020';
  end if;

  if not (public.is_admin() or public.is_merchant_owner(v_contract.merchant_id)) then
    raise exception 'Not authorized to close this contract' using errcode = 'P0021';
  end if;

  if v_contract.status <> 'active' then
    return;
  end if;

  update rental_contracts
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_contract_id;

  -- Free up the customer's eligibility ceiling by the original item value.
  update rental_eligibility
  set used_amount = greatest(0, used_amount - v_contract.original_item_value),
      updated_at = now()
  where user_id = v_contract.customer_user_id;

  update promissory_notes
  set status = 'settled',
      settled_at = now(),
      updated_at = now()
  where contract_id = p_contract_id
    and status in ('signed', 'pending')
    and not exists (
      select 1 from damage_cases dc
      where dc.contract_id = p_contract_id and dc.status <> 'dismissed'
    );
end;
$$;

grant execute on function public.close_rental_contract(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- on_damage_case_inserted — same pivot
-- ---------------------------------------------------------------------

create or replace function public.on_damage_case_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
begin
  select * into v_contract from rental_contracts where id = new.contract_id;
  if not found then
    return new;
  end if;

  if v_contract.status = 'active' then
    update rental_contracts
    set status = 'ended',
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
    where id = new.contract_id;

    update rental_eligibility
    set used_amount = greatest(0, used_amount - v_contract.original_item_value),
        updated_at = now()
    where user_id = v_contract.customer_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_damage_case_inserted on public.damage_cases;
create trigger trg_on_damage_case_inserted
  after insert on public.damage_cases
  for each row execute function public.on_damage_case_inserted();
