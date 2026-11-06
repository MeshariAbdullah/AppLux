-- =====================================================================
-- D-1 (Package 2) — dispute resolution never ends the rental contract
-- nor releases rental eligibility (20260502130700)
-- =====================================================================
-- Approved business principle (Product Owner, Package 2 review):
--   A terminal damage/dispute outcome must NEVER, by itself, imply that
--   the rented asset was returned, permanently lost, or that the rental
--   contract should end — for every severity (partial / total /
--   non_return) and every outcome (claim_accepted / direct_settlement /
--   lend_settlement / unresolved / dismissed). Contract closure happens
--   only through an explicit, independently authorized asset-lifecycle
--   action: the verified-return closure workflow, the mutual
--   non-handover confirmation (both 20260502130600), or a FUTURE,
--   separately authorized asset-loss/write-off procedure (not part of
--   this migration). Eligibility stays committed until such a closure
--   transition completes. Financial dispute resolution and the asset
--   lifecycle are separate state machines.
--
-- What was wrong: trigger trg_on_damage_case_resolved (20260502124700,
-- AFTER UPDATE OF status ON damage_cases → on_damage_case_resolved())
-- ended a still-active contract and subtracted original_item_value
-- from rental_eligibility.used_amount whenever a case flipped from
-- open/escalated to settled/unresolved. Every terminal dispute path
-- funnels through resolve_dispute_case(), so a mere financial
-- settlement silently closed the rental with no closure reason, no
-- closure_via and no contract_events audit row.
--
-- This migration:
--   * REPLACES the trigger function body: no contract status change,
--     no ended_at, no eligibility decrement, no closure transition is
--     invoked. The trigger DDL itself is untouched (same name/timing).
--   * PRESERVES the canonical-model synchronisation for out-of-band
--     status flips (dispute_phase → 'resolved'; dismissed → outcome
--     'dismissed' when unset), exactly as before.
--   * ADDS one accurate, idempotent audit row per qualifying transition
--     (open/escalated → settled|unresolved|dismissed):
--     contract_events.event = 'dispute_terminal_recorded', from_state =
--     to_state = the contract's CURRENT status (unchanged), with
--     metadata {case_id, case_number, case_status, outcome,
--     agreed_amount, contract_status, lifecycle_unaffected: true,
--     asset_return_recorded: false}. It states that the lifecycle was
--     NOT affected and never suggests the item was returned. The
--     metadata.case_id guard makes it emit at most once per case.
--   * Touches NO grants, NO RLS, NO other function. Historical rows
--     closed by the old behaviour (e.g. staging LND-WMPSRN, ended with
--     NULL closure fields) are deliberately left as they are — no
--     backfill, no invented closure evidence.
--
-- Rollback: forward-fix only. Re-running the 20260502124700 function
-- block would restore the defect and is not recommended.
-- Regression: supabase/tests/dispute_resolution_contract_independence_test.sql
-- =====================================================================

create or replace function public.on_damage_case_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_outcome  text;
begin
  -- Qualifying transition: the case leaves a live status for a
  -- terminal one. Re-flips between terminal statuses never qualify, so
  -- the audit row below cannot be emitted twice for the same case.
  if new.status in ('settled', 'unresolved', 'dismissed')
     and old.status in ('open', 'escalated') then

    -- Read-only look at the contract: its status is recorded as-is and
    -- is NOT modified here (D-1 principle). No lock is taken.
    select * into v_contract from rental_contracts where id = new.contract_id;
    v_outcome := coalesce(new.dispute_outcome::text, new.status::text);

    if found and not exists (
      select 1 from contract_events ce
       where ce.contract_id = new.contract_id
         and ce.event = 'dispute_terminal_recorded'
         and ce.metadata->>'case_id' = new.id::text
    ) then
      perform log_contract_event(
        new.contract_id, v_contract.invoice_id, null,
        'dispute_terminal_recorded',
        v_contract.status::text, v_contract.status::text,
        v_outcome, null,
        jsonb_build_object(
          'case_id', new.id,
          'case_number', new.case_number,
          'case_status', new.status,
          'outcome', v_outcome,
          'agreed_amount', new.agreed_amount,
          'contract_status', v_contract.status,
          'lifecycle_unaffected', true,
          'asset_return_recorded', false));
    end if;

    -- Canonical-model sync for out-of-band (direct SQL) status flips —
    -- a no-op for RPC-driven resolutions, which set dispute_phase in
    -- the same UPDATE. The UPDATE omits `status`, so this trigger does
    -- not re-fire. Semantics unchanged from 20260502124700.
    if new.dispute_phase <> 'resolved' then
      if new.status = 'dismissed' then
        update damage_cases
           set dispute_phase = 'resolved',
               dispute_outcome = coalesce(dispute_outcome, 'dismissed'),
               updated_at = now()
         where id = new.id;
      else
        update damage_cases
           set dispute_phase = 'resolved', updated_at = now()
         where id = new.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.on_damage_case_resolved() is
  'D-1 (20260502130700): a terminal dispute outcome (settled / unresolved / dismissed) never ends the rental contract, never releases eligibility and never invokes a closure transition. Records one dispute_terminal_recorded contract_events row per qualifying transition (lifecycle_unaffected=true, asset_return_recorded=false) and keeps the dispute_phase synchronisation for out-of-band status flips. Contract closure happens only through the authorized asset-lifecycle paths of 20260502130600.';
