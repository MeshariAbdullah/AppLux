-- =====================================================================
-- AppLux — eligibility release must equal the eligibility hold
-- =====================================================================
-- Invariant (single source of truth for exposure accounting):
--
--   reserved at activation                       = original_item_value
--   released at clean close                      = original_item_value
--   released when a settled dispute ends a live
--   contract                                     = original_item_value
--
-- The live activation path (activate_rental_without_payment_and_note,
-- 20260502122400, re-stated in 20260502122900) holds
-- rental_contracts.original_item_value. 20260502120500 aligned the
-- release paths to the same column. 20260502124500 then rebuilt
-- close_rental_contract and the damage-resolution trigger from the
-- OLDER 20260502120400 body, regressing both releases to total_amount
-- — an asymmetric hold: closing a rental with item value 20,000 and
-- rental fee 2,000 would strand 18,000 of the customer's ceiling.
--
-- This migration is FORWARD-ONLY and a corrected SUPERSET of
-- 20260502124500: it redefines every function it touched, so applying
-- it converges production to the correct state whether or not 124500
-- was ever applied:
--
--   * on_damage_case_inserted  — report is NOT a closure (no status
--     change, no ended_at, no eligibility change; P0023 guard).
--   * close_rental_contract    — P0020/P0021/P0022 guards unchanged;
--     release = original_item_value; note-settle clause unchanged.
--   * on_damage_case_resolved  — settled dispute ends a live contract
--     and releases original_item_value exactly once.
--   * one-unresolved-case-per-contract partial unique index.
--
-- Exactly-once release stays tied to the contract's active→ended
-- transition (either in close_rental_contract or in the resolution
-- trigger, never both, never on insert/dismiss). greatest(0, …)
-- keeps the release from underflowing a legacy row whose hold was
-- smaller than the mirror (documented D1/D2 populations).
-- Offer reservations (eligibility_reserved_amount) and limit_amount
-- are deliberately untouched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Case INSERT: validation only, never a lifecycle mutation.
-- ---------------------------------------------------------------------

create or replace function public.on_damage_case_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status contract_status;
begin
  select status into v_status from rental_contracts where id = new.contract_id;
  if not found then
    -- FK enforces existence; belt-and-suspenders only.
    return new;
  end if;

  if v_status in ('pending', 'cancelled') then
    raise exception 'Damage case requires a started rental contract'
      using errcode = 'P0023';
  end if;

  -- DELIBERATELY NO lifecycle mutation here: no status change, no
  -- ended_at, no eligibility release.
  return new;
end;
$$;

drop trigger if exists trg_on_damage_case_inserted on public.damage_cases;
create trigger trg_on_damage_case_inserted
  after insert on public.damage_cases
  for each row execute function public.on_damage_case_inserted();

-- ---------------------------------------------------------------------
-- 2) One unresolved case per contract (idempotent re-create).
-- ---------------------------------------------------------------------

create unique index if not exists damage_cases_one_unresolved_per_contract
  on public.damage_cases (contract_id)
  where status in ('open', 'escalated');

-- ---------------------------------------------------------------------
-- 3) Clean close: releases EXACTLY the activation hold
--    (original_item_value), never the rental fee (total_amount).
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

  -- Idempotent: only fire lifecycle bumps when transitioning from active.
  if v_contract.status <> 'active' then
    return;
  end if;

  -- An unresolved damage / non-return case blocks the successful-return
  -- close. Resolution (settled or dismissed) reopens the path.
  if exists (
    select 1 from damage_cases dc
    where dc.contract_id = p_contract_id
      and dc.status in ('open', 'escalated')
  ) then
    raise exception 'Cannot close as returned while a damage or non-return case is unresolved'
      using errcode = 'P0022';
  end if;

  update rental_contracts
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_contract_id;

  -- Release the customer's eligibility hold once — the SAME amount the
  -- activation committed: the item's original value, NOT the rental fee.
  update rental_eligibility
  set used_amount = greatest(0, used_amount - v_contract.original_item_value),
      updated_at = now()
  where user_id = v_contract.customer_user_id;

  -- Settle the linked note only when the rental closes clean.
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
-- 4) Resolution: a settled case ends a still-active contract and
--    releases the SAME activation hold, exactly once. Dismissal
--    releases nothing (the normal close path then applies).
-- ---------------------------------------------------------------------

create or replace function public.on_damage_case_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
begin
  if new.status = 'settled' and old.status in ('open', 'escalated') then
    select * into v_contract from rental_contracts where id = new.contract_id;
    if found and v_contract.status = 'active' then
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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_damage_case_resolved on public.damage_cases;
create trigger trg_on_damage_case_resolved
  after update of status on public.damage_cases
  for each row execute function public.on_damage_case_resolved();
