-- =====================================================================
-- Phase 8e — identity verification state + rental gate
-- =====================================================================
-- Business rule: the renter MUST NOT enter identity data at signup.
-- Signup collects only basic account info (full name, mobile, email,
-- password). Identity is verified later via Nafath / official flow
-- the first time the customer enters a legal-commitment step
-- (accepting a rental package + creating the promissory note).
--
-- This migration:
--
--   1. Adds first-class verification state on `profiles`:
--        identity_verified         boolean    (gate flag)
--        identity_verified_at      timestamptz
--        identity_provider         text       ('nafath' | 'admin' | 'legacy')
--        identity_reference_id     text       (Nafath transaction id, etc.)
--
--   2. Backfills legacy customers — anyone with national_id set or
--      nafath_verified_at populated is treated as verified via
--      'legacy', preserving the existing seeded scenarios.
--
--   3. New SECURITY DEFINER RPC `record_identity_verification`
--      lets a customer flip themselves to verified after the live
--      verification ceremony (or simulation). Scoped to auth.uid()
--      so a customer can only verify themselves.
--
--   4. Narrows `accept_rental_invoice` to reject the call when the
--      caller's profile isn't identity_verified. The legal
--      commitment (contract creation) cannot happen for an
--      unverified customer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Columns
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists identity_verified      boolean     not null default false,
  add column if not exists identity_verified_at   timestamptz,
  add column if not exists identity_provider      text,
  add column if not exists identity_reference_id  text;

create index if not exists profiles_identity_verified_idx
  on public.profiles(identity_verified);

-- ---------------------------------------------------------------------
-- (2) Backfill — preserve legacy customers' access to the rental flow
-- ---------------------------------------------------------------------

update public.profiles
   set identity_verified    = true,
       identity_verified_at = coalesce(nafath_verified_at, updated_at, now()),
       identity_provider    = case
                                when nafath_verified_at is not null then 'nafath'
                                else 'legacy'
                              end
 where role = 'customer'
   and identity_verified = false
   and (national_id is not null or nafath_verified_at is not null);

-- ---------------------------------------------------------------------
-- (3) record_identity_verification RPC
-- ---------------------------------------------------------------------
-- The caller verifies themselves. Idempotent: re-calling on an
-- already-verified profile leaves the original timestamps intact.

create or replace function public.record_identity_verification(
  p_provider     text default 'nafath',
  p_reference_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0060';
  end if;

  -- Only allow a small set of provider strings so callers can't store
  -- arbitrary garbage. Extend this list when a new integration lands.
  if p_provider is null or p_provider not in ('nafath', 'admin', 'legacy', 'simulation') then
    raise exception 'Unsupported identity provider (got %)', p_provider
      using errcode = 'P0061';
  end if;

  update public.profiles
     set identity_verified      = true,
         identity_verified_at   = coalesce(identity_verified_at, now()),
         identity_provider      = coalesce(identity_provider, p_provider),
         identity_reference_id  = coalesce(identity_reference_id, p_reference_id),
         updated_at             = now()
   where id = v_uid;
end;
$$;

grant execute on function public.record_identity_verification(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- (4) Gate accept_rental_invoice on identity verification
-- ---------------------------------------------------------------------
-- Legal commitment (contract creation) cannot happen for an
-- unverified customer. Keep every other check + period derivation
-- from the previous migration (Phase 8d). New error code P0004 so
-- clients can detect this specific failure and route the customer
-- through the verification ceremony before retrying.

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
  v_identity_ok      boolean;
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

  -- IDENTITY GATE: the customer must be identity-verified before any
  -- legal commitment (contract creation) can happen.
  select identity_verified into v_identity_ok
  from profiles where id = auth.uid();
  if not coalesce(v_identity_ok, false) then
    raise exception 'Identity verification required before accepting a rental'
      using errcode = 'P0004';
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
