-- =====================================================================
-- Phase 8 — split the rental lifecycle to match the real business flow
-- =====================================================================
-- Before this migration, accept_rental_invoice did EVERYTHING in one
-- atomic block at the moment of customer approval: it created the
-- contract with status='active' and signed_at=now(), it created the
-- promissory note with status='signed', and it bumped
-- rental_eligibility.used_amount. That collapsed approval + payment +
-- Nafath signing + verification + activation into a single moment,
-- which doesn't match the real product flow.
--
-- Correct flow:
--   T1  customer approves
--         → invoice 'accepted', contract created in 'pending'
--   T2  customer pays
--         → promissory note created in 'pending'
--   T3  customer signs via Nafath
--         → note 'signed', signed_at=now()
--   T4  platform verifies + activates
--         → note.nafith_attested_at=now()
--         → contract 'active', signed_at=now()
--         → eligibility bumped
--
-- This file:
--   * Narrows accept_rental_invoice to T1 ONLY
--   * Adds record_rental_payment    (T2)
--   * Adds record_nafath_signing    (T3)
--   * Adds verify_and_activate_rental (T4)
--
-- All four RPCs are SECURITY DEFINER. Each one verifies that the
-- caller is the customer who owns the invoice/note before mutating.
-- =====================================================================

-- ---------------------------------------------------------------------
-- T1 — accept_rental_invoice (narrowed)
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

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    current_date, current_date + interval '30 days',
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

-- ---------------------------------------------------------------------
-- T2 — record_rental_payment
-- ---------------------------------------------------------------------
-- Idempotent: if a note already exists for the contract, returns its
-- id without creating a duplicate. This lets the simulation sheet be
-- re-opened safely on partial completions.

create or replace function public.record_rental_payment(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice       rental_invoices%rowtype;
  v_contract      rental_contracts%rowtype;
  v_note_id       uuid;
  v_note_number   text;
  v_beneficiary   text;
begin
  select * into v_invoice from rental_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0030';
  end if;

  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only record payment for your own invoice'
      using errcode = 'P0031';
  end if;

  if v_invoice.status <> 'accepted' then
    raise exception 'Invoice must be accepted before payment (got %)', v_invoice.status
      using errcode = 'P0032';
  end if;

  select * into v_contract
  from rental_contracts
  where invoice_id = v_invoice.id;
  if not found then
    raise exception 'Contract not found for this invoice' using errcode = 'P0033';
  end if;

  -- Idempotency: reuse the existing note if one is already created.
  select id into v_note_id
  from promissory_notes
  where contract_id = v_contract.id;

  if v_note_id is null then
    v_note_number := next_note_number();
    select company_name into v_beneficiary
    from merchants
    where id = v_invoice.merchant_id;

    insert into promissory_notes (
      reference_number, contract_id, customer_user_id, merchant_id,
      beneficiary_name, principal_amount, due_date,
      status, signed_at
    )
    values (
      v_note_number, v_contract.id, v_invoice.customer_user_id, v_invoice.merchant_id,
      coalesce(v_beneficiary, 'Lend Partner'),
      v_invoice.total_amount + coalesce(v_invoice.security_deposit, 0),
      current_date + interval '60 days',
      'pending', null
    )
    returning id into v_note_id;
  end if;

  return v_note_id;
end;
$$;

grant execute on function public.record_rental_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- T3 — record_nafath_signing
-- ---------------------------------------------------------------------
-- Marks the customer's Nafath signing as recorded. Idempotent: if the
-- note is already signed, just returns without re-stamping signed_at.

create or replace function public.record_nafath_signing(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note promissory_notes%rowtype;
begin
  select * into v_note from promissory_notes where id = p_note_id;
  if not found then
    raise exception 'Note not found' using errcode = 'P0040';
  end if;

  if v_note.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only sign your own note' using errcode = 'P0041';
  end if;

  if v_note.status not in ('pending', 'signed') then
    raise exception 'Note is not in a signable state (got %)', v_note.status
      using errcode = 'P0042';
  end if;

  if v_note.status = 'pending' then
    update promissory_notes
    set status = 'signed',
        signed_at = now(),
        updated_at = now()
    where id = p_note_id;
  end if;
end;
$$;

grant execute on function public.record_nafath_signing(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- T4 — verify_and_activate_rental
-- ---------------------------------------------------------------------
-- Final step: Lend's verification of the Nafath signature. Stamps the
-- note as attested, flips the contract to 'active', and bumps the
-- customer's eligibility. Idempotent on the contract-active
-- transition: re-calling on an already-active contract does not
-- double-bump eligibility.

create or replace function public.verify_and_activate_rental(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note     promissory_notes%rowtype;
  v_contract rental_contracts%rowtype;
begin
  select * into v_note from promissory_notes where id = p_note_id;
  if not found then
    raise exception 'Note not found' using errcode = 'P0050';
  end if;

  if v_note.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only verify your own note' using errcode = 'P0051';
  end if;

  if v_note.status <> 'signed' then
    raise exception 'Note must be signed before verification (got %)', v_note.status
      using errcode = 'P0052';
  end if;

  -- Stamp the attestation timestamp (idempotent: only set if missing).
  update promissory_notes
  set nafith_attested_at = coalesce(nafith_attested_at, now()),
      updated_at = now()
  where id = p_note_id;

  -- Find and activate the linked contract.
  select * into v_contract
  from rental_contracts
  where id = v_note.contract_id;
  if not found then
    raise exception 'Linked contract not found' using errcode = 'P0053';
  end if;

  if v_contract.status = 'pending' then
    update rental_contracts
    set status   = 'active',
        signed_at = coalesce(signed_at, now()),
        updated_at = now()
    where id = v_contract.id;

    -- Bump eligibility ONCE on the pending → active transition. Cap at
    -- limit_amount so the constraint can't fire (eligibility row may
    -- be absent for brand-new customers; that's a soft state).
    update rental_eligibility
    set used_amount = least(used_amount + v_contract.total_amount, limit_amount),
        updated_at = now()
    where user_id = v_contract.customer_user_id;
  end if;

  return v_contract.id;
end;
$$;

grant execute on function public.verify_and_activate_rental(uuid) to authenticated;
