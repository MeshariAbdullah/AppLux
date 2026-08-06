-- =====================================================================
-- AppLux — damage/non-return report must NOT close the rental
-- =====================================================================
-- Production incident: tapping "الإبلاغ عن ضرر أو عدم إرجاع" and creating
-- a damage case marked the contract as if the asset had been returned:
-- the Phase 6 AFTER-INSERT trigger (20260502120400) set
-- rental_contracts.status='ended' + ended_at=now() — the SAME terminal
-- state a successful close produces — and released the customer's
-- eligibility hold while the claim was still open. The client then
-- rendered "تم إرجاع الأصل" / "تم إغلاق التأجير" from ended_at.
--
-- Corrected lifecycle model:
--
--   * Raising a case is a REPORT, not a closure. The contract stays
--     'active' (dispute workflow) and the eligibility hold stays in
--     place — it mirrors the promissory-note principal, which is the
--     security for the claim.
--   * close_rental_contract() ("تم استلام الأصل") remains the ONLY path
--     to a clean close — and now refuses while an unresolved case
--     exists (P0022), so the two flows cannot cross even by accident.
--   * Resolution is what finally moves the lifecycle:
--       - case settled   → contract ends, eligibility releases (once)
--       - case dismissed → contract stays active; the normal close
--         path applies (and releases eligibility exactly once there)
--   * At most ONE unresolved case per contract (partial unique index):
--     duplicate taps / re-reports resume the existing case instead of
--     forking a second one.
--
-- Exactly-once eligibility release invariant: every release is tied to
-- the contract's active→ended transition (either in
-- close_rental_contract or in on_damage_case_resolved), never to case
-- creation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Case INSERT no longer mutates the rental lifecycle.
--    The trigger becomes a pure validation guard: a case may only be
--    raised against a contract that actually reached the rental stage
--    ('active', or 'ended' for damage discovered after a clean close).
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
  -- ended_at, no eligibility release. See header comment.
  return new;
end;
$$;

-- (trigger trg_on_damage_case_inserted already exists and keeps
--  pointing at the redefined function.)

-- ---------------------------------------------------------------------
-- 2) One unresolved case per contract. Makes report creation
--    effectively idempotent at the DB level: a double-tap or a retry
--    hits unique_violation instead of forking a duplicate case, and the
--    client resumes the existing row.
-- ---------------------------------------------------------------------

create unique index if not exists damage_cases_one_unresolved_per_contract
  on public.damage_cases (contract_id)
  where status in ('open', 'escalated');

-- ---------------------------------------------------------------------
-- 3) Clean close refuses while a case is unresolved. The merchant
--    resolves (settle/dismiss) first; "تم استلام الأصل" must never
--    silently swallow an open dispute.
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

-- ---------------------------------------------------------------------
-- 4) Resolution finally moves the lifecycle. When a case transitions
--    to 'settled', the disputed rental ends and the eligibility hold
--    releases — exactly once, tied to the active→ended transition.
--    The note is NOT settled here (the close_rental_contract note
--    clause already excludes contracts with non-dismissed cases; a
--    settled claim keeps the note's fate with the admin workflow).
--    'dismissed' deliberately does nothing: the contract simply
--    returns to the normal close path.
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
      set used_amount = greatest(0, used_amount - v_contract.total_amount),
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
