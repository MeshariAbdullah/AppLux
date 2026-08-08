-- =====================================================================
-- AppLux — Phase-1 dispute lifecycle: server foundation
-- =====================================================================
-- Canonical dispute state machine + settlement engine for the damage /
-- non-return flow. Server-authoritative: every lifecycle transition
-- happens through guarded SECURITY DEFINER RPCs; no client UPDATE of
-- lifecycle fields. UI comes later.
--
-- Model (two fields — flow position vs business outcome):
--
--   dispute_phase:   awaiting_customer → direct_settlement
--                    → lend_mediation → resolved
--   dispute_outcome: claim_accepted | direct_settlement
--                    | lend_settlement | unresolved | dismissed
--                    (NULL until resolved; NULL on a resolved row means
--                     an out-of-band/legacy settle — possible only via
--                     direct SQL, never via the RPCs.)
--
-- Legacy damage_cases.status stays the driver of the ALREADY-TESTED
-- contract/eligibility mechanics (20260502124600) and is kept in sync
-- by the engine:
--   agreement outcomes  → status='settled'
--   unresolved outcome  → status='unresolved'   (new enum value)
--   dismissed           → unchanged semantics
-- The resolution trigger ends a still-active contract and releases
-- rental_eligibility by ORIGINAL_ITEM_VALUE exactly once for BOTH
-- terminal statuses. Legacy stage ('nafith'/'execution') is never
-- written; promissory notes are never created/settled here.
--
-- Failed Lend mediation (explicit product decision): the dispute ends
-- inside Lend with outcome='unresolved'; the contract ends (it must
-- not stay stuck active) but this is NEVER successful-return
-- semantics; eligibility releases once (the customer's ceiling is not
-- blocked forever, and no liability is implied either way).
--
-- Direct settlement is EXACTLY TWO rounds; exhaustion auto-moves the
-- case to lend_mediation (no manual escalate). Lend submits at most
-- ONE mediation proposal; BOTH parties must accept it to settle.
--
-- Error codes (new range):
--   P0200 not a party / not authorized on this case
--   P0201 action not allowed in the current phase
--   P0202 objection reason required
--   P0203 a pending proposal already exists
--   P0204 direct settlement rounds exhausted
--   P0205 proposal not found / not pending
--   P0206 cannot respond to your own proposal
--   P0207 lend proposal already exists
--   P0208 this party already responded
--   P0209 case not found
--   P0210 invalid amount
--   P0211 lend mediation is admin-only
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Types
-- ---------------------------------------------------------------------

do $$ begin
  create type public.dispute_phase as enum
    ('awaiting_customer', 'direct_settlement', 'lend_mediation', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_outcome as enum
    ('claim_accepted', 'direct_settlement', 'lend_settlement',
     'unresolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_party as enum ('merchant', 'customer', 'lend');
exception when duplicate_object then null; end $$;

-- Terminal legacy status for "settlement through Lend ended without
-- agreement". Deliberately NOT added to the one-unresolved-case index
-- or the P0022 close guard: it is terminal, not blocking.
alter type public.damage_status add value if not exists 'unresolved';

-- ---------------------------------------------------------------------
-- 1) damage_cases: canonical dispute columns
-- ---------------------------------------------------------------------

alter table public.damage_cases
  add column if not exists dispute_phase public.dispute_phase
    not null default 'awaiting_customer',
  add column if not exists dispute_outcome public.dispute_outcome,
  add column if not exists customer_response_at timestamptz,
  add column if not exists customer_objection_reason text,
  add column if not exists agreed_amount numeric(12,2);

-- Backfill pre-existing rows to a consistent phase. Provenance of any
-- manually-settled legacy row is unknown → outcome stays NULL there.
update public.damage_cases set dispute_phase = 'resolved',
       dispute_outcome = coalesce(dispute_outcome, 'dismissed')
where status = 'dismissed' and dispute_phase <> 'resolved';
update public.damage_cases set dispute_phase = 'resolved'
where status = 'settled' and dispute_phase <> 'resolved';
update public.damage_cases set dispute_phase = 'lend_mediation'
where status = 'escalated' and dispute_phase = 'awaiting_customer';

create index if not exists damage_cases_dispute_phase_idx
  on public.damage_cases (dispute_phase);

-- ---------------------------------------------------------------------
-- 2) Settlement proposals + per-party responses (immutable history)
-- ---------------------------------------------------------------------

create table if not exists public.dispute_settlement_proposals (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid not null references public.damage_cases(id) on delete cascade,
  kind               text not null check (kind in ('direct', 'lend')),
  -- 1 or 2 for direct proposals; NULL for the single lend proposal.
  round              smallint check (round in (1, 2)),
  proposed_by_party  public.dispute_party not null,
  proposed_by_user_id uuid references public.profiles(id),
  amount             numeric(12,2) not null check (amount >= 0),
  note               text,
  -- Maintained ONLY by the RPCs: pending → accepted | rejected.
  status             text not null default 'pending'
                     check (status in ('pending', 'accepted', 'rejected')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  constraint dispute_proposals_round_shape check (
    (kind = 'direct' and round is not null and proposed_by_party <> 'lend')
    or (kind = 'lend' and round is null and proposed_by_party = 'lend')
  )
);

create index if not exists dispute_proposals_case_idx
  on public.dispute_settlement_proposals (case_id, created_at);

-- One live proposal per case at a time.
create unique index if not exists dispute_proposals_one_pending_per_case
  on public.dispute_settlement_proposals (case_id)
  where status = 'pending';

-- At most one lend proposal per case, ever.
create unique index if not exists dispute_proposals_one_lend_per_case
  on public.dispute_settlement_proposals (case_id)
  where kind = 'lend';

-- Each direct round number used at most once per case.
create unique index if not exists dispute_proposals_direct_round_once
  on public.dispute_settlement_proposals (case_id, round)
  where kind = 'direct';

-- Per-party responses. Direct proposals expect exactly one row (the
-- counterparty); the lend proposal expects up to two (merchant AND
-- customer respond independently). Insert-only — never updated.
create table if not exists public.dispute_proposal_responses (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.dispute_settlement_proposals(id) on delete cascade,
  party         public.dispute_party not null check (party in ('merchant', 'customer')),
  responded_by_user_id uuid references public.profiles(id),
  accepted      boolean not null,
  created_at    timestamptz not null default now(),
  unique (proposal_id, party)
);

-- ---------------------------------------------------------------------
-- 3) Dispute events — the persisted, immutable timeline that will
--    power the neutral dispute file. System-written only.
-- ---------------------------------------------------------------------

create table if not exists public.dispute_events (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.damage_cases(id) on delete cascade,
  event_type   text not null check (event_type in (
    'claim_opened',
    'customer_accepted',
    'customer_objected',
    'evidence_added',
    'direct_proposal_submitted',
    'direct_proposal_accepted',
    'direct_proposal_rejected',
    'direct_round_exhausted',
    'moved_to_lend_mediation',
    'lend_proposal_submitted',
    'merchant_accepted_lend_proposal',
    'customer_accepted_lend_proposal',
    'lend_proposal_rejected',
    'dispute_resolved',
    'dispute_unresolved'
  )),
  actor_user_id uuid references public.profiles(id),
  actor_party   public.dispute_party,
  -- Structured, PII-free payload (ids/amounts/round numbers only).
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists dispute_events_case_idx
  on public.dispute_events (case_id, created_at);

-- Backfill: every existing case gets its claim_opened event at the
-- original raised_at (idempotent via anti-join).
insert into public.dispute_events (case_id, event_type, actor_user_id, actor_party, metadata, created_at)
select dc.id, 'claim_opened', dc.raised_by_user_id, 'merchant',
       jsonb_build_object('severity', dc.severity, 'claim_amount', dc.claim_amount),
       dc.raised_at
from public.damage_cases dc
where not exists (
  select 1 from public.dispute_events e
  where e.case_id = dc.id and e.event_type = 'claim_opened'
);

-- ---------------------------------------------------------------------
-- 4) Notifications: dispute support (schema only; UI later)
-- ---------------------------------------------------------------------

alter table public.notifications
  add column if not exists case_id uuid references public.damage_cases(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',                 -- existing behavior preserved
  'dispute_claim_submitted',      -- → customer
  'dispute_customer_accepted',    -- → merchant
  'dispute_customer_objected',    -- → merchant
  'dispute_proposal_received',    -- → counterparty        (repeatable)
  'dispute_proposal_accepted',    -- → proposer            (repeatable)
  'dispute_proposal_rejected',    -- → proposer            (repeatable)
  'dispute_moved_to_lend',        -- → both parties
  'dispute_lend_proposal',        -- → both parties
  'dispute_resolved',             -- → both parties
  'dispute_unresolved'            -- → both parties
));

-- Strictly-once dispute notifications (per user+type+case). Proposal
-- notifications are excluded — they legitimately repeat per proposal
-- and carry the proposal id in metadata for deep-linking.
create unique index if not exists notifications_dispute_event_once
  on public.notifications (user_id, type, case_id)
  where case_id is not null
    and type in ('dispute_claim_submitted', 'dispute_customer_accepted',
                 'dispute_customer_objected', 'dispute_moved_to_lend',
                 'dispute_lend_proposal', 'dispute_resolved',
                 'dispute_unresolved');

-- read_at stays the ONLY end-user-mutable column.
create or replace function public.guard_notification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.type is distinct from old.type
       or new.invoice_id is distinct from old.invoice_id
       or new.case_id is distinct from old.case_id
       or new.metadata is distinct from old.metadata
       or new.merchant_display_name is distinct from old.merchant_display_name
       or new.scan_token is distinct from old.scan_token
       or new.created_at is distinct from old.created_at then
      raise exception 'only read_at may be updated on a notification'
        using errcode = 'P0140';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Internal helpers (NOT granted to clients)
-- ---------------------------------------------------------------------

create or replace function public.dispute_notify(
  p_user_id uuid,
  p_type text,
  p_case_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name jsonb;
begin
  if p_user_id is null then return; end if;
  select m.display_name into v_name
  from damage_cases dc join merchants m on m.id = dc.merchant_id
  where dc.id = p_case_id;
  insert into notifications (user_id, type, case_id, merchant_display_name, metadata)
  values (p_user_id, p_type, p_case_id, v_name, coalesce(p_metadata, '{}'::jsonb))
  on conflict do nothing;
end;
$$;
revoke all on function public.dispute_notify(uuid, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.dispute_event(
  p_case_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_party public.dispute_party,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dispute_events (case_id, event_type, actor_user_id, actor_party, metadata)
  values (p_case_id, p_event_type, p_actor_user_id, p_actor_party,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke all on function public.dispute_event(uuid, text, uuid, public.dispute_party, jsonb) from public, anon, authenticated;

-- Centralized terminal resolution. Sets phase/outcome/agreed amount,
-- syncs the legacy status ('settled' for agreements, 'unresolved' for
-- the failed-mediation closure) — which fires the resolution trigger
-- below to end a still-active contract and release eligibility by
-- ORIGINAL_ITEM_VALUE exactly once — then writes the terminal event +
-- notifications to both parties.
create or replace function public.resolve_dispute_case(
  p_case_id uuid,
  p_outcome public.dispute_outcome,
  p_agreed_amount numeric,
  p_actor_user_id uuid,
  p_actor_party public.dispute_party
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_owner uuid;
  v_terminal_status damage_status;
  v_event text;
  v_notif text;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_case.dispute_phase = 'resolved' then
    return; -- idempotent: already terminal
  end if;

  v_terminal_status := case when p_outcome = 'unresolved'
                            then 'unresolved'::damage_status
                            else 'settled'::damage_status end;
  v_event := case when p_outcome = 'unresolved'
                  then 'dispute_unresolved' else 'dispute_resolved' end;
  v_notif := case when p_outcome = 'unresolved'
                  then 'dispute_unresolved' else 'dispute_resolved' end;

  update damage_cases
  set dispute_phase   = 'resolved',
      dispute_outcome = p_outcome,
      agreed_amount   = p_agreed_amount,
      status          = v_terminal_status,
      resolved_at     = now(),
      resolved_by_user_id = p_actor_user_id,
      updated_at      = now()
  where id = p_case_id;

  perform public.dispute_event(p_case_id, v_event, p_actor_user_id, p_actor_party,
    jsonb_build_object('outcome', p_outcome, 'agreed_amount', p_agreed_amount));

  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_case.customer_user_id, v_notif, p_case_id,
    jsonb_build_object('outcome', p_outcome));
  perform public.dispute_notify(v_owner, v_notif, p_case_id,
    jsonb_build_object('outcome', p_outcome));
end;
$$;
revoke all on function public.resolve_dispute_case(uuid, public.dispute_outcome, numeric, uuid, public.dispute_party) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Resolution trigger: BOTH terminal statuses end a still-active
--    contract and release ORIGINAL_ITEM_VALUE exactly once. Never
--    touches promissory notes, stage, or Nafath fields. Also syncs
--    dispute_phase for out-of-band (direct SQL) status flips so the
--    canonical model can never read as live when legacy says terminal.
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
  if new.status in ('settled', 'unresolved')
     and old.status in ('open', 'escalated') then
    select * into v_contract from rental_contracts
    where id = new.contract_id for update;
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

    -- Out-of-band sync (no-op for RPC-driven resolutions, which set
    -- dispute_phase in the same UPDATE). Second update omits `status`
    -- from SET, so this trigger does not re-fire.
    if new.dispute_phase <> 'resolved' then
      update damage_cases set dispute_phase = 'resolved', updated_at = now()
      where id = new.id;
    end if;
  elsif new.status = 'dismissed' and old.status in ('open', 'escalated') then
    -- Dismissal is terminal too, but with NO lifecycle mechanics: the
    -- contract stays active and the normal close path applies. Keep
    -- the canonical model consistent for out-of-band dismissals.
    if new.dispute_phase <> 'resolved' then
      update damage_cases
      set dispute_phase = 'resolved',
          dispute_outcome = coalesce(dispute_outcome, 'dismissed'),
          updated_at = now()
      where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_damage_case_resolved on public.damage_cases;
create trigger trg_on_damage_case_resolved
  after update of status on public.damage_cases
  for each row execute function public.on_damage_case_resolved();

-- ---------------------------------------------------------------------
-- 7) Case INSERT: claim_opened event + customer notification (the
--    validation-only body from 124600 is preserved verbatim).
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
    return new;
  end if;

  if v_status in ('pending', 'cancelled') then
    raise exception 'Damage case requires a started rental contract'
      using errcode = 'P0023';
  end if;

  -- Report, not a closure: no lifecycle mutation (20260502124500 rule).
  perform public.dispute_event(new.id, 'claim_opened', new.raised_by_user_id, 'merchant',
    jsonb_build_object('severity', new.severity, 'claim_amount', new.claim_amount));
  perform public.dispute_notify(new.customer_user_id, 'dispute_claim_submitted', new.id,
    jsonb_build_object('severity', new.severity, 'claim_amount', new.claim_amount));
  return new;
end;
$$;

-- (trigger trg_on_damage_case_inserted keeps pointing at this function)

-- Backfill claim-submitted notifications for existing OPEN cases so the
-- future customer UI surfaces them (idempotent via the partial index).
do $$
declare r record;
begin
  for r in select id, customer_user_id from public.damage_cases where status = 'open' loop
    perform public.dispute_notify(r.customer_user_id, 'dispute_claim_submitted', r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) Party resolution helper (internal)
-- ---------------------------------------------------------------------

create or replace function public.dispute_party_of(
  p_case public.damage_cases,
  p_user uuid
) returns public.dispute_party
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user = p_case.customer_user_id then 'customer'::dispute_party
    when exists (select 1 from merchants m
                 where m.id = p_case.merchant_id and m.owner_user_id = p_user)
      then 'merchant'::dispute_party
    else null
  end;
$$;
revoke all on function public.dispute_party_of(public.damage_cases, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) RPC: customer_accept_claim
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 10) RPC: customer_object_to_claim
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 11) RPC: submit_settlement_proposal (direct rounds 1–2)
-- ---------------------------------------------------------------------

create or replace function public.submit_settlement_proposal(
  p_case_id uuid,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_round int;
  v_id uuid;
  v_counterparty_uid uuid;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'direct_settlement' then
    raise exception 'Direct settlement is not open in this phase'
      using errcode = 'P0201';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Invalid settlement amount' using errcode = 'P0210';
  end if;
  if exists (select 1 from dispute_settlement_proposals
             where case_id = p_case_id and status = 'pending') then
    raise exception 'A proposal is already awaiting a response'
      using errcode = 'P0203';
  end if;

  -- Server-side round counting — never client-supplied.
  select count(*) + 1 into v_round from dispute_settlement_proposals
  where case_id = p_case_id and kind = 'direct';
  if v_round > 2 then
    raise exception 'Both direct settlement rounds have been used'
      using errcode = 'P0204';
  end if;

  insert into dispute_settlement_proposals
    (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount, note)
  values (p_case_id, 'direct', v_round, v_party, v_uid, p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  perform public.dispute_event(p_case_id, 'direct_proposal_submitted', v_uid, v_party,
    jsonb_build_object('proposal_id', v_id, 'round', v_round, 'amount', p_amount));

  select case when v_party = 'customer' then m.owner_user_id
              else v_case.customer_user_id end
  into v_counterparty_uid
  from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_counterparty_uid, 'dispute_proposal_received', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'round', v_round, 'amount', p_amount));

  return v_id;
end;
$$;
grant execute on function public.submit_settlement_proposal(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12) RPC: respond_to_settlement_proposal (direct rounds)
--     Accept → dispute resolves (outcome=direct_settlement).
--     Reject on round 1 → round 2 stays available.
--     Reject on round 2 → AUTOMATIC move to lend_mediation.
-- ---------------------------------------------------------------------

create or replace function public.respond_to_settlement_proposal(
  p_proposal_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop dispute_settlement_proposals%rowtype;
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_owner uuid;
  v_proposer_uid uuid;
begin
  -- Consistent lock ordering across all RPCs: case row first, then the
  -- proposal row.
  select * into v_prop from dispute_settlement_proposals
  where id = p_proposal_id;
  if not found or v_prop.kind <> 'direct' then
    raise exception 'Proposal not found' using errcode = 'P0205';
  end if;
  select * into v_case from damage_cases where id = v_prop.case_id for update;
  select * into v_prop from dispute_settlement_proposals
  where id = p_proposal_id for update;

  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_party = v_prop.proposed_by_party then
    raise exception 'You cannot respond to your own proposal'
      using errcode = 'P0206';
  end if;
  if v_prop.status <> 'pending' or v_case.dispute_phase <> 'direct_settlement' then
    raise exception 'This proposal is no longer awaiting a response'
      using errcode = 'P0205';
  end if;

  insert into dispute_proposal_responses (proposal_id, party, responded_by_user_id, accepted)
  values (p_proposal_id, v_party, v_uid, p_accept);

  update dispute_settlement_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      resolved_at = now()
  where id = p_proposal_id;

  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  v_proposer_uid := case when v_prop.proposed_by_party = 'customer'
                         then v_case.customer_user_id else v_owner end;

  if p_accept then
    perform public.dispute_event(v_case.id, 'direct_proposal_accepted', v_uid, v_party,
      jsonb_build_object('proposal_id', p_proposal_id, 'round', v_prop.round,
                         'amount', v_prop.amount));
    perform public.dispute_notify(v_proposer_uid, 'dispute_proposal_accepted', v_case.id,
      jsonb_build_object('proposal_id', p_proposal_id, 'amount', v_prop.amount));
    perform public.resolve_dispute_case(
      v_case.id, 'direct_settlement', v_prop.amount, v_uid, v_party);
    return;
  end if;

  perform public.dispute_event(v_case.id, 'direct_proposal_rejected', v_uid, v_party,
    jsonb_build_object('proposal_id', p_proposal_id, 'round', v_prop.round,
                       'amount', v_prop.amount));
  perform public.dispute_notify(v_proposer_uid, 'dispute_proposal_rejected', v_case.id,
    jsonb_build_object('proposal_id', p_proposal_id, 'amount', v_prop.amount));

  if v_prop.round >= 2 then
    -- Both direct rounds exhausted → AUTOMATIC transition. No manual
    -- escalate button exists or is needed.
    update damage_cases
    set dispute_phase = 'lend_mediation', updated_at = now()
    where id = v_case.id;
    perform public.dispute_event(v_case.id, 'direct_round_exhausted', null, null,
      jsonb_build_object('rounds_used', 2));
    perform public.dispute_event(v_case.id, 'moved_to_lend_mediation', null, null);
    perform public.dispute_notify(v_case.customer_user_id, 'dispute_moved_to_lend', v_case.id);
    perform public.dispute_notify(v_owner, 'dispute_moved_to_lend', v_case.id);
  end if;
end;
$$;
grant execute on function public.respond_to_settlement_proposal(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 13) RPC: lend_submit_mediation_proposal (admin only, ONE per case)
-- ---------------------------------------------------------------------

create or replace function public.lend_submit_mediation_proposal(
  p_case_id uuid,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_owner uuid;
begin
  if not public.is_admin() then
    raise exception 'Lend mediation is admin-only' using errcode = 'P0211';
  end if;
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_case.dispute_phase <> 'lend_mediation' then
    raise exception 'Case is not in Lend mediation' using errcode = 'P0201';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Invalid settlement amount' using errcode = 'P0210';
  end if;
  if exists (select 1 from dispute_settlement_proposals
             where case_id = p_case_id and kind = 'lend') then
    raise exception 'A Lend mediation proposal already exists'
      using errcode = 'P0207';
  end if;

  insert into dispute_settlement_proposals
    (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount, note)
  values (p_case_id, 'lend', null, 'lend', v_uid, p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  perform public.dispute_event(p_case_id, 'lend_proposal_submitted', v_uid, 'lend',
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_case.customer_user_id, 'dispute_lend_proposal', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  perform public.dispute_notify(v_owner, 'dispute_lend_proposal', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  return v_id;
end;
$$;
grant execute on function public.lend_submit_mediation_proposal(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 14) RPC: respond_to_lend_proposal
--     BOTH parties must accept → outcome=lend_settlement.
--     EITHER party rejects   → outcome=unresolved (final; contract
--     ends WITHOUT successful-return semantics; eligibility releases
--     once; no note / Nafith / execution mutation of any kind).
-- ---------------------------------------------------------------------

create or replace function public.respond_to_lend_proposal(
  p_case_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_prop dispute_settlement_proposals%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_other_accepted boolean;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'lend_mediation' then
    raise exception 'Case is not in Lend mediation' using errcode = 'P0201';
  end if;

  select * into v_prop from dispute_settlement_proposals
  where case_id = p_case_id and kind = 'lend' for update;
  if not found or v_prop.status <> 'pending' then
    raise exception 'No Lend proposal is awaiting responses'
      using errcode = 'P0205';
  end if;

  if exists (select 1 from dispute_proposal_responses
             where proposal_id = v_prop.id and party = v_party) then
    raise exception 'This party already responded to the Lend proposal'
      using errcode = 'P0208';
  end if;

  insert into dispute_proposal_responses (proposal_id, party, responded_by_user_id, accepted)
  values (v_prop.id, v_party, v_uid, p_accept);

  if p_accept then
    perform public.dispute_event(p_case_id,
      case when v_party = 'merchant' then 'merchant_accepted_lend_proposal'
           else 'customer_accepted_lend_proposal' end,
      v_uid, v_party, jsonb_build_object('proposal_id', v_prop.id));

    select bool_or(accepted) into v_other_accepted
    from dispute_proposal_responses
    where proposal_id = v_prop.id and party <> v_party;

    if coalesce(v_other_accepted, false) then
      -- BOTH parties accepted → agreement through Lend.
      update dispute_settlement_proposals
      set status = 'accepted', resolved_at = now() where id = v_prop.id;
      perform public.resolve_dispute_case(
        p_case_id, 'lend_settlement', v_prop.amount, v_uid, v_party);
    end if;
    -- One acceptance alone resolves nothing.
    return;
  end if;

  -- A rejection ends settlement through Lend. Final unresolved state:
  -- neutral, no judgment, nothing legacy touched.
  update dispute_settlement_proposals
  set status = 'rejected', resolved_at = now() where id = v_prop.id;
  perform public.dispute_event(p_case_id, 'lend_proposal_rejected', v_uid, v_party,
    jsonb_build_object('proposal_id', v_prop.id));
  perform public.resolve_dispute_case(
    p_case_id, 'unresolved', null, v_uid, v_party);
end;
$$;
grant execute on function public.respond_to_lend_proposal(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 15) RLS
-- ---------------------------------------------------------------------

alter table public.dispute_settlement_proposals enable row level security;
alter table public.dispute_proposal_responses enable row level security;
alter table public.dispute_events enable row level security;

-- Read: the case's parties + admin. Writes: ONLY via the SECURITY
-- DEFINER RPCs above — no INSERT/UPDATE/DELETE policies exist.
create policy dispute_proposals_party_select on public.dispute_settlement_proposals
  for select using (
    exists (select 1 from public.damage_cases c
            where c.id = case_id
              and (c.customer_user_id = auth.uid()
                   or public.is_merchant_owner(c.merchant_id)
                   or public.is_admin()))
  );

create policy dispute_responses_party_select on public.dispute_proposal_responses
  for select using (
    exists (select 1 from public.dispute_settlement_proposals p
            join public.damage_cases c on c.id = p.case_id
            where p.id = proposal_id
              and (c.customer_user_id = auth.uid()
                   or public.is_merchant_owner(c.merchant_id)
                   or public.is_admin()))
  );

create policy dispute_events_party_select on public.dispute_events
  for select using (
    exists (select 1 from public.damage_cases c
            where c.id = case_id
              and (c.customer_user_id = auth.uid()
                   or public.is_merchant_owner(c.merchant_id)
                   or public.is_admin()))
  );

grant select on public.dispute_settlement_proposals to authenticated;
grant select on public.dispute_proposal_responses to authenticated;
grant select on public.dispute_events to authenticated;

-- Lifecycle fields on damage_cases are now RPC-only for merchants: the
-- legacy generic UPDATE policy (stage-scoped, unused by any client
-- code — verified) allowed direct PostgREST writes to status /
-- claim_amount. Sensitive transitions must not ride generic policies.
drop policy if exists damage_cases_merchant_update on public.damage_cases;

-- ---------------------------------------------------------------------
-- 16) Customer evidence (table + object policies)
-- ---------------------------------------------------------------------

-- uploaded_by_user_id is authoritative: whatever the client sends, the
-- row records the authenticated uploader (no impersonation either way).
create or replace function public.stamp_evidence_uploader()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.uploaded_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_evidence_uploader on public.damage_evidence;
create trigger trg_stamp_evidence_uploader
  before insert on public.damage_evidence
  for each row execute function public.stamp_evidence_uploader();

-- evidence_added event (system-written, PII-free).
create or replace function public.on_damage_evidence_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_party dispute_party;
begin
  select * into v_case from damage_cases where id = new.case_id;
  if found then
    v_party := public.dispute_party_of(v_case, new.uploaded_by_user_id);
    perform public.dispute_event(new.case_id, 'evidence_added',
      new.uploaded_by_user_id, v_party,
      jsonb_build_object('evidence_id', new.id, 'evidence_type', new.evidence_type));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_damage_evidence_inserted on public.damage_evidence;
create trigger trg_on_damage_evidence_inserted
  after insert on public.damage_evidence
  for each row execute function public.on_damage_evidence_inserted();

-- Customer may attach evidence to THEIR OWN case once they have
-- objected (direct settlement / lend mediation). Merchant behavior
-- unchanged. Cross-case uploads impossible (case ownership predicate).
create policy damage_evidence_customer_insert on public.damage_evidence
  for insert with check (
    exists (select 1 from public.damage_cases c
            where c.id = case_id
              and c.customer_user_id = auth.uid()
              and c.dispute_phase in ('direct_settlement', 'lend_mediation'))
  );

-- Storage OBJECT policies for case evidence, codified (they previously
-- existed only as dashboard-managed policies). Scope: objects whose
-- first path segment is a damage_cases id in the damage-evidence
-- bucket — receipts/ and handover/ prefixes are untouched (their first
-- segment is never a case id). Additive; does not broaden the bucket.
drop policy if exists "lend_case_evidence_select" on storage.objects;
create policy "lend_case_evidence_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'damage-evidence'
    and exists (
      select 1 from public.damage_cases c
      where c.id::text = split_part(name, '/', 1)
        and (c.customer_user_id = auth.uid()
             or public.is_merchant_owner(c.merchant_id)
             or public.is_admin())
    )
  );

drop policy if exists "lend_case_evidence_insert" on storage.objects;
create policy "lend_case_evidence_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'damage-evidence'
    and exists (
      select 1 from public.damage_cases c
      where c.id::text = split_part(name, '/', 1)
        and (
          (public.is_merchant_owner(c.merchant_id)
             and c.status in ('open', 'escalated'))
          or (c.customer_user_id = auth.uid()
             and c.dispute_phase in ('direct_settlement', 'lend_mediation'))
          or public.is_admin()
        )
    )
  );
