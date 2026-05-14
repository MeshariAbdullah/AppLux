-- =====================================================================
-- AppLux MVP — Phase 6 lifecycle alignment
-- =====================================================================
-- Closes the lifecycle gaps between the rental document chain and its
-- side effects (eligibility, note settlement, contract state under damage).
--
-- Before this migration:
--   * Contract closure was a plain UPDATE — the linked promissory note's
--     status and the customer's rental_eligibility.used_amount did not
--     change. Eligibility "leaked" each rental.
--   * Damage cases could be raised against a contract that stayed
--     'active', which is logically inconsistent.
--
-- After this migration:
--   * close_rental_contract(p_contract_id) — SECURITY DEFINER RPC that
--     ends the contract, decrements eligibility, and (only when no live
--     damage cases exist on the contract) settles the linked note.
--     Idempotent: callable multiple times, only the first active→ended
--     transition mutates side effects.
--   * AFTER INSERT trigger on damage_cases — when a case is created
--     against an active contract, the contract is closed and eligibility
--     is decremented. The note is NOT settled (it's the security for the
--     claim and must remain open until resolution).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normal closure RPC
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

  update rental_contracts
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_contract_id;

  -- Free up the customer's eligibility ceiling once.
  update rental_eligibility
  set used_amount = greatest(0, used_amount - v_contract.total_amount),
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
-- Damage-case insertion trigger
-- ---------------------------------------------------------------------
-- When a damage case is raised against an active contract, the rental is
-- effectively over: the item is either back-but-damaged or won't be
-- returned. Either way the contract should not stay 'active'. Eligibility
-- decrements once. The note is left open because it acts as security
-- for the damage claim resolution.
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
    set used_amount = greatest(0, used_amount - v_contract.total_amount),
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
