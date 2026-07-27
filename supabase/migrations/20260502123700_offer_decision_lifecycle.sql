-- =====================================================================
-- Customer offer-decision lifecycle — reject action + expiry
-- enforcement
-- =====================================================================
-- AUDIT: no reject RPC existed anywhere, and accept_rental_invoice
-- never looked at expires_at — an expired offer could still be
-- accepted. Expiry is DERIVED from rental_invoices.expires_at (no
-- stored 'expired' status; the reservation model 20260502123600
-- already excludes expired rows) — this migration keeps that single
-- source of truth: no cron, no status mutation.
--
-- Adds:
--   1. reject_rental_invoice(p_invoice_id) — customer-only, row-locked,
--      idempotent terminal transition issued/viewed → rejected.
--      * P0002  not the invoice's customer
--      * silent no-op when already 'rejected' (duplicate taps)
--      * P0171  offer expired — rejection no longer available
--      * P0172  any other non-actionable state (accepted/cancelled/
--               superseded/draft)
--      The invoice row is never deleted; history/audit data stays.
--   2. accept_rental_invoice — new body (extends 20260502123600):
--      * SELECT ... FOR UPDATE on the invoice row — accept, reject,
--        and merchant cancel now serialize on the row, so exactly one
--        terminal transition wins any race (the loser re-reads the
--        committed state and fails its status check). The UNIQUE
--        rental_contracts.invoice_id constraint remains the physical
--        backstop against double contracts.
--      * P0170 when expires_at has passed — expired offers cannot be
--        accepted inside the transaction regardless of client clocks.
--      Everything else (P0003 non-actionable, P0150 identity
--      snapshots, P0161 eligibility backstop, LND reference) is
--      unchanged.
--
-- RESERVATION IMPACT: none needed here — reservations are derived
-- (20260502123600), so a rejected or expired offer stops counting the
-- moment its row/clock changes: released exactly once, never negative,
-- nothing cached server-side.
--
-- Idempotent. ROLLBACK: drop reject_rental_invoice; re-apply the
-- 20260502123600 body of accept_rental_invoice.
-- =====================================================================

create or replace function public.reject_rental_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice rental_invoices%rowtype;
begin
  select * into v_invoice
    from rental_invoices
   where id = p_invoice_id
     for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001';
  end if;

  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only reject your own invoice' using errcode = 'P0002';
  end if;

  -- Idempotent: a duplicate reject tap is a no-op, never an error and
  -- never a second side effect (the reservation model is derived, so
  -- there is nothing to double-release anyway).
  if v_invoice.status = 'rejected' then
    return;
  end if;

  if v_invoice.status not in ('issued', 'viewed') then
    raise exception 'Offer is no longer actionable (got %)', v_invoice.status
      using errcode = 'P0172';
  end if;

  if v_invoice.expires_at is not null and v_invoice.expires_at <= now() then
    raise exception 'Offer expired — rejection is no longer available'
      using errcode = 'P0171';
  end if;

  update rental_invoices
     set status = 'rejected', updated_at = now()
   where id = p_invoice_id;
end;
$$;

grant execute on function public.reject_rental_invoice(uuid) to authenticated;

comment on function public.reject_rental_invoice(uuid) is
  'Customer rejects an issued/viewed offer (terminal, idempotent, row-locked). P0002 not owner; P0171 expired; P0172 other non-actionable states. Reservation release is automatic via the derived model (20260502123600).';

-- ---------------------------------------------------------------------
-- accept_rental_invoice — 123600 body + row lock + expiry gate (P0170)
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
  v_lessor_name      text;
  v_lessor_cr        text;
  v_lessee_name      text;
  v_lessee_nid       text;
  v_limit            numeric;
  v_used             numeric;
  v_reserved_others  numeric;
  v_exposure         numeric;
begin
  -- Row lock: accept/reject/cancel serialize here — one winner.
  select * into v_invoice
    from rental_invoices
   where id = p_invoice_id
     for update;
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

  -- Server-side expiry gate — client clocks are irrelevant.
  if v_invoice.expires_at is not null and v_invoice.expires_at <= now() then
    raise exception 'Offer expired — acceptance is no longer available'
      using errcode = 'P0170';
  end if;

  -- Party identity snapshots (20260502123500) — unchanged.
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

  -- Eligibility backstop (20260502123600) — unchanged.
  select limit_amount, used_amount
    into v_limit, v_used
    from rental_eligibility
   where user_id = v_invoice.customer_user_id
     for update;
  if not found then
    raise exception 'Customer has no rental eligibility'
      using errcode = 'P0161';
  end if;
  v_exposure := coalesce(nullif(v_invoice.original_item_value, 0), v_invoice.total_amount, 0);
  v_reserved_others := eligibility_reserved_amount(v_invoice.customer_user_id, v_invoice.id);
  if v_exposure > v_limit - v_used - v_reserved_others then
    raise exception 'Offer exposure exceeds available eligibility at acceptance'
      using errcode = 'P0161';
  end if;

  v_contract_number := next_contract_number();

  select max(rental_days) into v_rental_days
  from rental_invoice_items
  where invoice_id = v_invoice.id;
  v_rental_days := coalesce(v_rental_days, 30);

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
  'Accept issued/viewed invoice → pending contract (row-locked; LND ref + party snapshots + eligibility backstop). P0170 expired; P0003 non-actionable; P0150 identity; P0161 eligibility; P0001/P0002 unchanged.';

notify pgrst, 'reload schema';
