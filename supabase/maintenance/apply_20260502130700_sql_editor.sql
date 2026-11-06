-- =====================================================================
-- ONE-SHOT SQL-Editor apply of migration 20260502130700 (lend-test ONLY)
-- =====================================================================
-- D-1: dispute resolution never ends the rental contract nor releases
-- eligibility. Replaces ONLY the body of trigger function
-- on_damage_case_resolved() (trigger DDL, grants, RLS, every other
-- function untouched). Adds the dispute_terminal_recorded audit row.
--
-- Copy-paste this WHOLE file into the lend-test SQL Editor
-- (project ref hdwqavrwjwfgtdyjemfz — the project NAMED "lend-staging"
-- is LIVE PRODUCTION, never run this there) and run it once.
-- Structure (same safeguards as apply_20260502130400/130500/130600):
--   1. fail-closed preflight: staging marker, exactly 67 prior history
--      rows (20260502120000..20260502130600), 130700 not yet applied —
--      any failure aborts before anything changes;
--   2. the committed migration SQL, verbatim;
--   3. the CLI-compatible history INSERT in the SAME transaction;
--   4. read-only post-execution checks (every row must say OK).
--
-- Data: this migration modifies NO rows. Historical contracts ended by
-- the old trigger (e.g. LND-WMPSRN) stay exactly as they are — no
-- backfill, no invented closure evidence. Rollback is forward-fix only.
-- =====================================================================

begin;

do $preflight$
declare
  v_env  text;
  v_hist int;
  v_dup  int;
begin
  begin
    select env into v_env from public.environment_marker limit 1;
  exception when undefined_table then
    v_env := null;
  end;
  if v_env is distinct from 'staging' then
    raise exception
      'ABORT: environment_marker is % — this script may only run on the staging database (lend-test).',
      coalesce(v_env, 'MISSING');
  end if;

  select count(*) into v_hist
    from supabase_migrations.schema_migrations
   where version between '20260502120000' and '20260502130600';
  if v_hist <> 67 then
    raise exception
      'ABORT: expected 67 migration records (20260502120000..20260502130600), found %.', v_hist;
  end if;

  select count(*) into v_dup
    from supabase_migrations.schema_migrations
   where version = '20260502130700';
  if v_dup <> 0 then
    raise exception 'ABORT: migration 20260502130700 is already recorded as applied.';
  end if;

  raise notice 'Preflight OK: staging marker, 67 prior migrations intact, 130700 not yet applied.';
end $preflight$;

-- ---------------------------------------------------------------------
-- Migration 20260502130700 — verbatim
-- ---------------------------------------------------------------------
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
--     return_not_inferred_from_dispute: true}. It states that the
--     lifecycle was NOT affected and that the dispute outcome asserts
--     NOTHING about physical return evidence — neither its presence nor
--     its absence. The metadata.case_id guard makes it emit at most once
--     per case.
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
          'return_not_inferred_from_dispute', true));
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
  'D-1 (20260502130700): a terminal dispute outcome (settled / unresolved / dismissed) never ends the rental contract, never releases eligibility and never invokes a closure transition. Records one dispute_terminal_recorded contract_events row per qualifying transition (lifecycle_unaffected=true, return_not_inferred_from_dispute=true — the outcome asserts nothing about physical return evidence) and keeps the dispute_phase synchronisation for out-of-band status flips. Contract closure happens only through the authorized asset-lifecycle paths of 20260502130600.';

-- ---------------------------------------------------------------------
-- Record the migration (CLI-compatible; atomic with the change above)
-- ---------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values ('20260502130700', 'dispute_resolution_keeps_contract_open');

commit;

-- =====================================================================
-- Validation — read-only. Every row must say OK.
-- =====================================================================
with src as (
  select p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'on_damage_case_resolved'
),
checks(ord, item, expected, actual) as (
  select 1, 'migration history now (67 + this one)', '68',
         (select count(*)::text from supabase_migrations.schema_migrations)
  union all
  select 2, '130700 recorded', '1',
         (select count(*)::text from supabase_migrations.schema_migrations
           where version = '20260502130700'
             and name = 'dispute_resolution_keeps_contract_open')
  union all
  select 3, 'trigger no longer ends contracts', 'clean',
         (select case when prosrc ~* 'status\s*=\s*''ended''' or prosrc ~* 'ended_at\s*=' then 'STILL ENDS' else 'clean' end from src)
  union all
  select 4, 'trigger no longer releases eligibility', 'clean',
         (select case when prosrc ~* 'used_amount' or prosrc ~* 'rental_eligibility' then 'STILL RELEASES' else 'clean' end from src)
  union all
  select 5, 'trigger invokes no closure transition', 'clean',
         (select case when prosrc ~* 'finalize_contract_closure' or prosrc ~* 'close_rental_contract' then 'INVOKES CLOSURE' else 'clean' end from src)
  union all
  select 6, 'terminal audit event present in source', 'present',
         (select case when prosrc like '%dispute_terminal_recorded%' then 'present' else 'MISSING' end from src)
  union all
  select 7, 'trigger still bound to damage_cases', '1',
         (select count(*)::text from pg_trigger
           where tgname = 'trg_on_damage_case_resolved'
             and tgrelid = 'public.damage_cases'::regclass)
  union all
  select 8, 'function security mode unchanged (definer)', 'true',
         (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'on_damage_case_resolved')
  union all
  select 9, 'audit table still client-read-only', 'select-only',
         (select case when has_table_privilege('authenticated', 'public.contract_events', 'select')
                       and not has_table_privilege('authenticated', 'public.contract_events', 'insert')
                      then 'select-only' else 'WRONG' end)
  union all
  select 10, 'Package 1 close path intact (single signature)', 'p_contract_id uuid, p_note text',
         (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'close_rental_contract')
  union all
  select 11, 'environment marker intact', 'staging',
         (select env from public.environment_marker limit 1)
)
select item, expected, actual,
       case when expected = actual then 'OK' else 'FAIL' end as ok
from checks order by ord;

-- Informational (not a check): contracts ended by the OLD behaviour —
-- ended with no documented closure reason while a non-dismissed
-- terminal case exists. Left untouched by design.
select c.contract_number, c.ended_at, d.case_number, d.status as case_status
  from public.rental_contracts c
  join public.damage_cases d on d.contract_id = c.id
 where c.status = 'ended' and c.closure_reason is null
   and d.status in ('settled', 'unresolved')
 order by c.ended_at;
