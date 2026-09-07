-- =====================================================================
-- Customer response deadline + auto-escalation on non-response
-- (مهلة رد العميل والتصعيد التلقائي عند عدم الاستجابة)
-- =====================================================================
-- BUSINESS PROBLEM: a claim in dispute_phase = 'awaiting_customer'
-- could stay blocked forever if the customer simply never responded.
-- The merchant — the party requesting their right — had no path
-- forward.
--
-- MODEL (built on the 20260502124700 lifecycle, nothing replaced):
--
--   claim opened → customer_response_deadline = raised_at + 48h
--     ├─ customer responds in time  → EXISTING flow, unchanged
--     │    accept  → resolved (claim_accepted)
--     │    object  → direct_settlement (two rounds) → …
--     └─ deadline passes with NO response →
--          customer_no_response_recorded_at stamped (DOCUMENTATION,
--          never acceptance/approval of the claim)
--          dispute_phase → 'lend_mediation'  (Lend review on the
--          available information — the EXISTING phase; no new enum
--          value needed, so every admin surface already lists it)
--
-- The direct_settlement phase is deliberately SKIPPED on non-response:
-- a negotiation round only makes sense after an actual customer
-- response. Contract stays active and eligibility stays held — exactly
-- like a normal move to mediation; silence resolves nothing.
--
-- ASYMMETRY (explicit): only the customer's initial claim response is
-- deadlined. States waiting on the MERCHANT (e.g. a customer proposal
-- pending the merchant's answer) keep their existing behavior and are
-- never treated as customer non-response.
--
-- ENFORCEMENT LAYERS:
--   1. process_overdue_customer_responses() — the sweeper. Scheduled
--      via pg_cron below when available (same project pattern as the
--      push-dispatch schedule); also invocable by an admin.
--   2. customer_accept_claim / customer_object_to_claim refuse a late
--      response with P0212 — the deadline holds even before the next
--      sweep, and there is deliberately NO late-response/appeal path
--      (none exists in the product).
--   3. The UI derives active/expired display from the stored deadline
--      (same clock-derivation pattern as offer expiry) so screens are
--      correct between sweeps.
--
-- WORDING RULE (enforced in copy, honored here in event naming):
-- non-response is DOCUMENTED (توثيق) and the case proceeds to REVIEW
-- (مراجعة) on the available information — never "approved", never a
-- legal judgment.
--
-- BACKWARD COMPATIBILITY: existing open awaiting_customer cases are
-- backfilled with a FRESH 48h window from migration time (fair notice
-- through the new UI/notification rather than instant escalation).
-- All other rows keep NULL deadline fields and render exactly as
-- before; every existing RPC/transition is preserved.
--
-- New error code: P0212 customer response window closed.
-- Idempotent. ROLLBACK: unschedule the cron job; drop the two
-- functions; re-apply the 20260502124700 bodies of
-- on_damage_case_inserted / customer_accept_claim /
-- customer_object_to_claim and its notification/event CHECKs; the two
-- columns are additive and may stay.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Columns
-- ---------------------------------------------------------------------

alter table public.damage_cases
  add column if not exists customer_response_deadline timestamptz,
  add column if not exists customer_no_response_recorded_at timestamptz;

comment on column public.damage_cases.customer_response_deadline is
  '48-hour deadline for the customer''s INITIAL claim response (set at claim creation). NULL on legacy rows and after the awaiting phase. Display + RPC gate + sweeper all read this single value.';
comment on column public.damage_cases.customer_no_response_recorded_at is
  'When customer non-response was DOCUMENTED and the case moved to Lend review. Documentation only — never acceptance/approval of the claim.';

-- Sweeper hot path: open awaiting cases with a live deadline.
create index if not exists damage_cases_response_deadline_idx
  on public.damage_cases (customer_response_deadline)
  where dispute_phase = 'awaiting_customer'
    and customer_no_response_recorded_at is null;

-- ---------------------------------------------------------------------
-- (2) Event + notification vocabulary
-- ---------------------------------------------------------------------

alter table public.dispute_events drop constraint if exists dispute_events_event_type_check;
alter table public.dispute_events add constraint dispute_events_event_type_check
  check (event_type in (
    'claim_opened',
    'customer_response_deadline_set',
    'customer_accepted',
    'customer_objected',
    'evidence_added',
    'direct_proposal_submitted',
    'direct_proposal_accepted',
    'direct_proposal_rejected',
    'direct_round_exhausted',
    'customer_no_response_recorded',
    'moved_to_lend_mediation',
    'lend_proposal_submitted',
    'merchant_accepted_lend_proposal',
    'customer_accepted_lend_proposal',
    'lend_proposal_rejected',
    'dispute_resolved',
    'dispute_unresolved'
  ));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',
  'dispute_claim_submitted',
  'dispute_customer_accepted',
  'dispute_customer_objected',
  'dispute_proposal_received',
  'dispute_proposal_accepted',
  'dispute_proposal_rejected',
  'dispute_customer_no_response',   -- NEW → customer + merchant + admins
  'dispute_moved_to_lend',
  'dispute_lend_proposal',
  'dispute_resolved',
  'dispute_unresolved'
));

-- Strictly-once semantics extend to the new type.
drop index if exists notifications_dispute_event_once;
create unique index notifications_dispute_event_once
  on public.notifications (user_id, type, case_id)
  where case_id is not null
    and type in ('dispute_claim_submitted', 'dispute_customer_accepted',
                 'dispute_customer_objected', 'dispute_customer_no_response',
                 'dispute_moved_to_lend', 'dispute_lend_proposal',
                 'dispute_resolved', 'dispute_unresolved');

-- ---------------------------------------------------------------------
-- (3) Backfill: existing open awaiting cases get a fresh 48h window
-- ---------------------------------------------------------------------

update public.damage_cases
   set customer_response_deadline = now() + interval '48 hours',
       updated_at = now()
 where dispute_phase = 'awaiting_customer'
   and status = 'open'
   and customer_response_deadline is null;

insert into public.dispute_events (case_id, event_type, actor_user_id, actor_party, metadata)
select dc.id, 'customer_response_deadline_set', null, null,
       jsonb_build_object('deadline', dc.customer_response_deadline, 'backfilled', true)
  from public.damage_cases dc
 where dc.dispute_phase = 'awaiting_customer'
   and dc.customer_response_deadline is not null
   and not exists (
     select 1 from public.dispute_events e
      where e.case_id = dc.id and e.event_type = 'customer_response_deadline_set'
   );

-- ---------------------------------------------------------------------
-- (4) New claims: stamp the 48h deadline at creation
-- ---------------------------------------------------------------------
-- 20260502124700 body preserved verbatim; adds the deadline stamp, its
-- event, and passes the deadline in the customer notification metadata.
-- (AFTER INSERT trigger — the deadline lands via a same-transaction
-- UPDATE; the trigger fires on INSERT only, so no recursion.)

create or replace function public.on_damage_case_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status contract_status;
  v_deadline timestamptz;
begin
  select status into v_status from rental_contracts where id = new.contract_id;
  if not found then
    return new;
  end if;

  if v_status in ('pending', 'cancelled') then
    raise exception 'Damage case requires a started rental contract'
      using errcode = 'P0023';
  end if;

  -- 48-hour customer response window, anchored to the claim itself.
  v_deadline := coalesce(new.raised_at, now()) + interval '48 hours';
  update damage_cases
     set customer_response_deadline = v_deadline
   where id = new.id;

  -- Report, not a closure: no lifecycle mutation (20260502124500 rule).
  perform public.dispute_event(new.id, 'claim_opened', new.raised_by_user_id, 'merchant',
    jsonb_build_object('severity', new.severity, 'claim_amount', new.claim_amount));
  perform public.dispute_event(new.id, 'customer_response_deadline_set', null, null,
    jsonb_build_object('deadline', v_deadline));
  perform public.dispute_notify(new.customer_user_id, 'dispute_claim_submitted', new.id,
    jsonb_build_object('severity', new.severity, 'claim_amount', new.claim_amount,
                       'response_deadline', v_deadline));
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (5) record_customer_no_response — the documented escalation
-- ---------------------------------------------------------------------
-- Internal (not client-callable). Documentation-only semantics: stamps
-- the record, moves the case to Lend review (lend_mediation) on the
-- available information, and notifies customer + merchant + admins.
-- Contract stays active; eligibility stays held; NOTHING is resolved
-- and silence is never treated as acceptance.

create or replace function public.record_customer_no_response(p_case_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_owner uuid;
  r record;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then return false; end if;
  -- Guards: only an OPEN case still awaiting the customer, whose
  -- deadline exists and has passed, escalates. A case waiting on the
  -- merchant (direct_settlement etc.) can NEVER take this path.
  if v_case.dispute_phase <> 'awaiting_customer'
     or v_case.status <> 'open'
     or v_case.customer_no_response_recorded_at is not null
     or v_case.customer_response_deadline is null
     or v_case.customer_response_deadline > now() then
    return false;
  end if;

  update damage_cases
     set customer_no_response_recorded_at = now(),
         dispute_phase = 'lend_mediation',
         updated_at = now()
   where id = p_case_id;

  perform public.dispute_event(p_case_id, 'customer_no_response_recorded', null, null,
    jsonb_build_object('deadline', v_case.customer_response_deadline));
  perform public.dispute_event(p_case_id, 'moved_to_lend_mediation', null, null,
    jsonb_build_object('reason', 'customer_no_response'));

  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_case.customer_user_id, 'dispute_customer_no_response', p_case_id,
    jsonb_build_object('deadline', v_case.customer_response_deadline));
  perform public.dispute_notify(v_owner, 'dispute_customer_no_response', p_case_id,
    jsonb_build_object('deadline', v_case.customer_response_deadline));
  -- Lend/admin visibility: every admin profile gets the same
  -- once-per-case notification (the admin cases screen also lists the
  -- case under Lend review regardless).
  for r in select id from profiles where role = 'admin' loop
    perform public.dispute_notify(r.id, 'dispute_customer_no_response', p_case_id,
      jsonb_build_object('deadline', v_case.customer_response_deadline));
  end loop;
  return true;
end;
$$;
revoke all on function public.record_customer_no_response(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- (6) Sweeper — scheduled + admin-invocable
-- ---------------------------------------------------------------------

create or replace function public.process_overdue_customer_responses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  -- Cron/service contexts carry no JWT (auth.uid() null); an
  -- authenticated caller must be an admin.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'P0211';
  end if;

  for r in
    select id from damage_cases
     where dispute_phase = 'awaiting_customer'
       and status = 'open'
       and customer_no_response_recorded_at is null
       and customer_response_deadline is not null
       and customer_response_deadline <= now()
     for update skip locked
  loop
    if public.record_customer_no_response(r.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.process_overdue_customer_responses() to authenticated;

comment on function public.process_overdue_customer_responses() is
  'Sweeps open awaiting_customer cases whose 48h response deadline passed: documents the non-response and moves each case to Lend review (lend_mediation) on the available information. Cron/service-invoked; admins may invoke manually. Returns the number of cases escalated.';

-- Schedule every 15 minutes where pg_cron is available (Supabase). If
-- this block reports that pg_cron is missing, enable the extension in
-- Dashboard → Database → Extensions and schedule manually:
--   select cron.schedule('dispute-response-deadline-sweep',
--                        '*/15 * * * *',
--                        $sweep$select public.process_overdue_customer_responses()$sweep$);
do $$
begin
  perform cron.unschedule('dispute-response-deadline-sweep');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('dispute-response-deadline-sweep', '*/15 * * * *',
    'select public.process_overdue_customer_responses()');
  raise notice 'dispute-response-deadline-sweep scheduled via pg_cron (every 15 min)';
exception when undefined_schema or undefined_function or undefined_table then
  raise warning 'pg_cron not available — enable the pg_cron extension and schedule process_overdue_customer_responses() manually (see comment above)';
end $$;

-- ---------------------------------------------------------------------
-- (7) Deadline gate on the two customer response RPCs (P0212)
-- ---------------------------------------------------------------------
-- 20260502124700 bodies preserved verbatim + the single deadline gate.
-- A late attempt is refused (the sweeper performs the documented
-- escalation — the refusal must not be rolled back with it). There is
-- deliberately no late-response path.

create or replace function public.customer_accept_claim(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_uid is null or v_uid <> v_case.customer_user_id then
    raise exception 'Only the contract customer may respond to this claim'
      using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'awaiting_customer' then
    raise exception 'Claim response is no longer available in this phase'
      using errcode = 'P0201';
  end if;
  if v_case.customer_response_deadline is not null
     and v_case.customer_response_deadline <= now() then
    raise exception 'The response window for this claim has closed'
      using errcode = 'P0212';
  end if;

  update damage_cases
  set customer_response_at = now(), updated_at = now()
  where id = p_case_id;

  perform public.dispute_event(p_case_id, 'customer_accepted', v_uid, 'customer',
    jsonb_build_object('claim_amount', v_case.claim_amount));
  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_owner, 'dispute_customer_accepted', p_case_id,
    jsonb_build_object('claim_amount', v_case.claim_amount));

  -- Direct closure: documented acceptance of the claim itself. NO
  -- settlement record is created; NOT successful-return semantics.
  perform public.resolve_dispute_case(
    p_case_id, 'claim_accepted', v_case.claim_amount, v_uid, 'customer');
end;
$$;
grant execute on function public.customer_accept_claim(uuid) to authenticated;

create or replace function public.customer_object_to_claim(
  p_case_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_uid is null or v_uid <> v_case.customer_user_id then
    raise exception 'Only the contract customer may respond to this claim'
      using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'awaiting_customer' then
    raise exception 'Claim response is no longer available in this phase'
      using errcode = 'P0201';
  end if;
  if v_case.customer_response_deadline is not null
     and v_case.customer_response_deadline <= now() then
    raise exception 'The response window for this claim has closed'
      using errcode = 'P0212';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Objection reason is required' using errcode = 'P0202';
  end if;

  -- Objection: dispute stays open, contract stays active, eligibility
  -- stays held. Direct settlement (max TWO rounds) begins.
  update damage_cases
  set dispute_phase = 'direct_settlement',
      customer_response_at = now(),
      customer_objection_reason = trim(p_reason),
      updated_at = now()
  where id = p_case_id;

  perform public.dispute_event(p_case_id, 'customer_objected', v_uid, 'customer',
    '{}'::jsonb);
  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_owner, 'dispute_customer_objected', p_case_id);
end;
$$;
grant execute on function public.customer_object_to_claim(uuid, text) to authenticated;

notify pgrst, 'reload schema';
