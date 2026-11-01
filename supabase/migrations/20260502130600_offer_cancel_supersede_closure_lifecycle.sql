-- =====================================================================
-- Package 1 — offer cancellation, explicit supersession, closure
-- reasons, early-closure / return-declaration lifecycle, 48h automatic
-- return confirmation (feature-flagged OFF), audit events,
-- notifications. Product-Owner-approved semantics (Phase C4+).
-- =====================================================================
-- Approved rules implemented here:
--   * Pre-acceptance: customer may reject (existing, now timestamped,
--     audited, and the merchant is notified); the owning merchant may
--     cancel (new, idempotent, customer notified). Both release the
--     eligibility reservation through the EXISTING formula (reserved =
--     Σ exposure over issued/viewed, unexpired — no eligibility writes).
--   * Explicit supersession: a new offer may name the exact offer it
--     replaces (replaces_invoice_id). Replacement is atomic (same
--     transaction as the insert), linked both ways, audited, and never
--     automatic across other outstanding offers. Acceptance of a
--     superseded offer is impossible (status leaves issued/viewed).
--   * Post-acceptance: NO contract cancellation. The contract_status
--     'cancelled' enum value remains deliberately UNUSED — closure with
--     a server-DERIVED reason is the only exit:
--       not_handed_over — accepted-pending, both-party confirmation,
--                         contradictory-evidence checks, never
--                         fabricates a handover;
--       returned_early  — handed over, closed before end_date;
--       returned        — closed at/after end_date.
--   * 48h automatic return confirmation: customer declares return →
--     merchant notified with tracked DELIVERY states (a queued
--     notifications/push_jobs row is NOT delivery proof — the deadline
--     starts only at a recorded verified delivery) → reminders at T-24h
--     and T-4h → merchant confirms (close) or objects (admin review) →
--     after the deadline the service job MAY auto-close, re-validating
--     EVERY blocking condition at execution time under row locks, and
--     records the outcome as PROCEDURAL confirmation due to
--     non-response, never as physical proof of receipt. The executor is
--     gated behind platform_settings.auto_return_closure
--     (default DISABLED) and a configurable high-value exclusion policy
--     (threshold ships NULL = unset; Product Owner sets it).
--   * Closure is OPERATIONAL only: no refunds, no payment reversal, no
--     deposit release is implied anywhere. Future AlinmaPay phases hook
--     into contract_events + closure_reason/closure_via.
--   * Append-only audit: contract_events (server-written only; clients
--     read their own, admins read all; no client write path).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.contract_closure_reason as enum
    ('returned', 'returned_early', 'not_handed_over');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contract_closure_via as enum
    ('merchant', 'mutual', 'auto', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.closure_request_kind as enum
    ('non_handover', 'return_declared');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.closure_request_status as enum
    ('open', 'confirmed', 'objected', 'admin_review', 'auto_closed', 'voided');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------
alter table public.rental_invoices
  add column if not exists rejected_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists replaces_invoice_id uuid references public.rental_invoices(id),
  add column if not exists superseded_by_invoice_id uuid references public.rental_invoices(id);

alter table public.rental_contracts
  add column if not exists closure_reason public.contract_closure_reason,
  add column if not exists closure_via    public.contract_closure_via,
  add column if not exists closure_note   text,
  add column if not exists closed_by      uuid;

-- ---------------------------------------------------------------------
-- 3. Audit ledger — append-only, server-written
-- ---------------------------------------------------------------------
create table if not exists public.contract_events (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid references public.rental_contracts(id),
  invoice_id    uuid references public.rental_invoices(id),
  request_id    uuid,
  actor_user_id uuid,
  event         text not null,
  from_state    text,
  to_state      text,
  reason        text,
  note          text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint contract_events_target check
    (contract_id is not null or invoice_id is not null)
);
create index if not exists contract_events_contract_idx on public.contract_events (contract_id, created_at);
create index if not exists contract_events_invoice_idx  on public.contract_events (invoice_id, created_at);

alter table public.contract_events enable row level security;

-- Parties read their own history; admins read everything. There is NO
-- insert/update/delete policy and NO write grant for the API roles:
-- rows are written exclusively by SECURITY DEFINER functions.
drop policy if exists contract_events_party_select on public.contract_events;
create policy contract_events_party_select on public.contract_events
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.rental_contracts c
      where c.id = contract_events.contract_id
        and (c.customer_user_id = auth.uid() or public.is_merchant_owner(c.merchant_id))
    )
    or exists (
      select 1 from public.rental_invoices i
      where i.id = contract_events.invoice_id
        and (i.customer_user_id = auth.uid() or public.is_merchant_owner(i.merchant_id))
    )
  );

grant select on public.contract_events to authenticated;

create or replace function public.log_contract_event(
  p_contract_id uuid, p_invoice_id uuid, p_request_id uuid,
  p_event text, p_from text, p_to text,
  p_reason text default null, p_note text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into contract_events
    (contract_id, invoice_id, request_id, actor_user_id, event,
     from_state, to_state, reason, note, metadata)
  values
    (p_contract_id, p_invoice_id, p_request_id, auth.uid(), p_event,
     p_from, p_to, p_reason, p_note, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.log_contract_event(uuid, uuid, uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Platform settings (server-side feature flags / policies)
-- ---------------------------------------------------------------------
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin_select on public.platform_settings;
create policy platform_settings_admin_select on public.platform_settings
  for select to authenticated using (public.is_admin());
grant select on public.platform_settings to authenticated;
-- No client write path: values change via SQL Editor / future admin RPC.

insert into public.platform_settings (key, value) values
  ('auto_return_closure', '{"enabled": false}'::jsonb),
  -- threshold ships NULL on purpose: the Product Owner sets the number.
  ('high_value_rental_policy',
   '{"enabled": false, "threshold": null, "action": "exclude_auto_close"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.platform_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select value from platform_settings where key = p_key $$;
revoke all on function public.platform_setting(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Closure requests + notice-delivery tracking
-- ---------------------------------------------------------------------
create table if not exists public.contract_closure_requests (
  id                     uuid primary key default gen_random_uuid(),
  contract_id            uuid not null references public.rental_contracts(id),
  kind                   public.closure_request_kind not null,
  status                 public.closure_request_status not null default 'open',
  requested_by           uuid not null,
  requested_role         public.app_role not null,
  declared_return_at     timestamptz,
  request_note           text,
  evidence_path          text,
  -- 48h clock: set ONLY when a verified delivery is recorded.
  deadline_at            timestamptz,
  reminder_24_sent_at    timestamptz,
  reminder_final_sent_at timestamptz,
  responded_by           uuid,
  responded_at           timestamptz,
  response_note          text,
  resolved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- One live request per contract (open or escalated) — duplicates are
-- answered idempotently by the request RPC, concurrency by this index.
create unique index if not exists closure_request_one_live
  on public.contract_closure_requests (contract_id)
  where status in ('open', 'admin_review');

alter table public.contract_closure_requests enable row level security;
drop policy if exists closure_requests_party_select on public.contract_closure_requests;
create policy closure_requests_party_select on public.contract_closure_requests
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.rental_contracts c
      where c.id = contract_closure_requests.contract_id
        and (c.customer_user_id = auth.uid() or public.is_merchant_owner(c.merchant_id))
    )
  );
grant select on public.contract_closure_requests to authenticated;

create trigger closure_requests_set_updated_at
  before update on public.contract_closure_requests
  for each row execute function public.set_updated_at();

create table if not exists public.closure_notice_deliveries (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.contract_closure_requests(id),
  notice         text not null,   -- return_declared | reminder_24h | final_warning | ...
  channel        text not null default 'push',
  status         text not null default 'queued'
                 check (status in ('queued', 'delivered', 'failed')),
  attempt        int  not null default 1,
  provider_ref   text,
  queued_at      timestamptz not null default now(),
  delivered_at   timestamptz,
  failed_at      timestamptz,
  failure_reason text
);
create index if not exists closure_notice_request_idx
  on public.closure_notice_deliveries (request_id, queued_at);

alter table public.closure_notice_deliveries enable row level security;
drop policy if exists closure_notices_party_select on public.closure_notice_deliveries;
create policy closure_notices_party_select on public.closure_notice_deliveries
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.contract_closure_requests r
      join public.rental_contracts c on c.id = r.contract_id
      where r.id = closure_notice_deliveries.request_id
        and (c.customer_user_id = auth.uid() or public.is_merchant_owner(c.merchant_id))
    )
  );
grant select on public.closure_notice_deliveries to authenticated;

-- ---------------------------------------------------------------------
-- 6. Internal helpers (no client execute)
-- ---------------------------------------------------------------------
-- Extend the notifications type whitelist (last set in 20260502124700)
-- with the Package 1 lifecycle notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',
  'renter_otp_ready',
  'dispute_claim_submitted',
  'dispute_customer_accepted',
  'dispute_customer_objected',
  'dispute_proposal_received',
  'dispute_proposal_accepted',
  'dispute_proposal_rejected',
  'dispute_customer_no_response',
  'dispute_moved_to_lend',
  'dispute_lend_proposal',
  'dispute_resolved',
  'dispute_unresolved',
  'dispute_dismissed',
  -- Package 1 (20260502130600):
  'offer_rejected',
  'offer_cancelled',
  'closure_requested',
  'return_declared',
  'return_reminder',
  'return_final_warning',
  'closure_confirmed',
  'closure_objected',
  'closure_admin_resolved',
  'contract_closed'
));

-- Party notification writer (notifications table → existing push_jobs
-- trigger). NOT delivery proof — see closure_notice_deliveries.
create or replace function public.notify_party(
  p_user_id uuid, p_type text, p_invoice_id uuid,
  p_merchant_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name jsonb;
begin
  if p_merchant_id is not null then
    select display_name into v_name from merchants where id = p_merchant_id;
  end if;
  insert into notifications (user_id, type, invoice_id, merchant_display_name, metadata)
  values (p_user_id, p_type, p_invoice_id, v_name, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke all on function public.notify_party(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Core closer. Caller must already hold the contract row lock and have
-- performed authorization. Derives the reason server-side — it is never
-- caller-asserted — and NEVER writes handover evidence.
create or replace function public.finalize_contract_closure(
  p_contract_id uuid,
  p_via public.contract_closure_via,
  p_note text,
  p_expected_status public.contract_status
) returns public.contract_closure_reason
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_reason   public.contract_closure_reason;
begin
  select * into v_contract from rental_contracts
   where id = p_contract_id for update;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0020';
  end if;
  if v_contract.status <> p_expected_status then
    raise exception 'Contract is not in the expected state (got %)', v_contract.status
      using errcode = 'P0023';
  end if;

  -- Blocking claims: an unresolved damage / non-return case always
  -- blocks closure, whatever the path.
  if exists (
    select 1 from damage_cases dc
    where dc.contract_id = p_contract_id
      and dc.status in ('open', 'escalated')
  ) then
    raise exception 'Cannot close while a damage or non-return case is unresolved'
      using errcode = 'P0022';
  end if;

  if p_expected_status = 'pending' then
    -- not-handed-over path: refuse if any handover evidence exists.
    if v_contract.handover_at is not null
       or v_contract.receipt_photos_confirmed_at is not null
       or exists (select 1 from contract_receipt_photos p
                   where p.contract_id = p_contract_id) then
      raise exception 'Handover evidence exists — the non-handover path is not applicable'
        using errcode = 'P0024';
    end if;
    v_reason := 'not_handed_over';
  else
    v_reason := case when now() < (v_contract.end_date::timestamptz)
                     then 'returned_early' else 'returned' end;
  end if;

  update rental_contracts
     set status         = 'ended',
         ended_at       = coalesce(ended_at, now()),
         closure_reason = v_reason,
         closure_via    = p_via,
         closure_note   = coalesce(p_note, closure_note),
         closed_by      = auth.uid(),
         updated_at     = now()
   where id = p_contract_id;

  -- Eligibility (existing accounting rules, unchanged):
  --   * active → ended releases the committed exposure (item value) —
  --     identical math to 20260502124600;
  --   * pending → ended releases NOTHING here: a pending contract holds
  --     a formula-side RESERVATION (status-derived), which disappears
  --     by definition once the contract leaves 'pending'. used_amount
  --     was never incremented, so decrementing would double-release.
  if p_expected_status = 'active' then
    update rental_eligibility
       set used_amount = greatest(0, used_amount - v_contract.original_item_value),
           updated_at = now()
     where user_id = v_contract.customer_user_id;

    update promissory_notes
       set status = 'settled', settled_at = now(), updated_at = now()
     where contract_id = p_contract_id
       and status in ('signed', 'pending')
       and not exists (
         select 1 from damage_cases dc
         where dc.contract_id = p_contract_id and dc.status <> 'dismissed'
       );
  end if;

  perform log_contract_event(
    p_contract_id, v_contract.invoice_id, null, 'contract_closed',
    p_expected_status::text, 'ended', v_reason::text, p_note,
    jsonb_build_object('via', p_via));

  perform notify_party(v_contract.customer_user_id, 'contract_closed',
                       v_contract.invoice_id, v_contract.merchant_id,
                       jsonb_build_object('reason', v_reason, 'via', p_via));
  perform notify_party((select owner_user_id from merchants where id = v_contract.merchant_id),
                       'contract_closed', v_contract.invoice_id, v_contract.merchant_id,
                       jsonb_build_object('reason', v_reason, 'via', p_via));
  return v_reason;
end;
$$;
revoke all on function public.finalize_contract_closure(uuid, public.contract_closure_via, text, public.contract_status)
  from public, anon, authenticated;

-- High-value exclusion for the automatic path only. Threshold NULL or
-- policy disabled → nothing is high-value (the mechanism exists; the
-- number is a Product Owner decision).
create or replace function public.is_high_value_contract(p_contract public.rental_contracts)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  v := platform_setting('high_value_rental_policy');
  if v is null or coalesce((v->>'enabled')::boolean, false) = false then
    return false;
  end if;
  if v->>'threshold' is null then
    return false;
  end if;
  return coalesce(p_contract.original_item_value, 0) >= (v->>'threshold')::numeric;
end;
$$;
revoke all on function public.is_high_value_contract(public.rental_contracts)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Pre-acceptance: merchant cancellation + audited rejection
-- ---------------------------------------------------------------------
create or replace function public.merchant_cancel_rental_offer(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v rental_invoices%rowtype;
begin
  select * into v from rental_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Offer not found' using errcode = 'P0001';
  end if;
  if not (public.is_admin() or public.is_merchant_owner(v.merchant_id)) then
    raise exception 'Only the owning merchant may cancel this offer'
      using errcode = 'P0002';
  end if;
  if v.status = 'cancelled' then
    return;  -- idempotent
  end if;
  if v.status not in ('issued', 'viewed') then
    raise exception 'Offer can no longer be cancelled (got %)', v.status
      using errcode = 'P0003';
  end if;

  update rental_invoices
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = p_invoice_id;

  perform log_contract_event(null, p_invoice_id, null, 'offer_cancelled',
                             v.status::text, 'cancelled', null, null, '{}'::jsonb);
  perform notify_party(v.customer_user_id, 'offer_cancelled', p_invoice_id,
                       v.merchant_id);
  -- Eligibility: the reservation formula only counts issued/viewed —
  -- release is automatic, no balance writes (and no double release).
end;
$$;
grant execute on function public.merchant_cancel_rental_offer(uuid) to authenticated;

-- Rejection: same signature as 20260502123700, now with timestamp,
-- audit event and merchant notification.
create or replace function public.reject_rental_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice rental_invoices%rowtype;
begin
  select * into v_invoice from rental_invoices
   where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001';
  end if;
  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only reject your own invoice' using errcode = 'P0002';
  end if;
  if v_invoice.status = 'rejected' then
    return;  -- idempotent
  end if;
  if v_invoice.status not in ('issued', 'viewed') then
    raise exception 'Offer is no longer actionable (got %)', v_invoice.status
      using errcode = 'P0170';
  end if;
  if v_invoice.expires_at is not null and now() >= v_invoice.expires_at then
    raise exception 'Offer expired — rejection is no longer available'
      using errcode = 'P0171';
  end if;

  update rental_invoices
     set status = 'rejected', rejected_at = now(), updated_at = now()
   where id = p_invoice_id;

  perform log_contract_event(null, p_invoice_id, null, 'offer_rejected',
                             v_invoice.status::text, 'rejected', null, null, '{}'::jsonb);
  perform notify_party((select owner_user_id from merchants where id = v_invoice.merchant_id),
                       'offer_rejected', p_invoice_id, v_invoice.merchant_id);
end;
$$;
grant execute on function public.reject_rental_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Explicit supersession (atomic with the replacement insert)
-- ---------------------------------------------------------------------
create or replace function public.supersede_replaced_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_old rental_invoices%rowtype;
begin
  if new.replaces_invoice_id is null then
    return new;
  end if;
  select * into v_old from rental_invoices
   where id = new.replaces_invoice_id for update;
  if not found then
    raise exception 'Replaced offer not found' using errcode = 'P0180';
  end if;
  if v_old.merchant_id is distinct from new.merchant_id
     or v_old.customer_user_id is distinct from new.customer_user_id then
    raise exception 'A replacement offer must target the same merchant and customer'
      using errcode = 'P0181';
  end if;
  if v_old.status not in ('issued', 'viewed') then
    raise exception 'Only an issued/viewed offer can be superseded (got %)', v_old.status
      using errcode = 'P0182';
  end if;

  -- The forward link (superseded_by_invoice_id = new.id) cannot be set
  -- here: the replacement row does not exist yet, so its FK would fail.
  -- The AFTER INSERT companion trigger writes the link + audit event.
  update rental_invoices
     set status = 'superseded',
         superseded_at = now(),
         updated_at = now()
   where id = v_old.id;
  return new;
end;
$$;
revoke all on function public.supersede_replaced_offer() from public, anon, authenticated;

-- AFTER INSERT companion: now that the replacement row exists, record
-- the forward link on the superseded offer and the audit event.
create or replace function public.link_superseded_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_old_status text;
begin
  if new.replaces_invoice_id is null then
    return null;
  end if;
  update rental_invoices
     set superseded_by_invoice_id = new.id
   where id = new.replaces_invoice_id
  returning status::text into v_old_status;

  perform log_contract_event(null, new.replaces_invoice_id, null, 'offer_superseded',
                             null, coalesce(v_old_status, 'superseded'), null, null,
                             jsonb_build_object('replacement_invoice_id', new.id));
  return null;
end;
$$;
revoke all on function public.link_superseded_offer() from public, anon, authenticated;

-- BEFORE INSERT, and named to sort ahead of rental_invoices_eligibility_
-- guard: the replaced offer's reservation must be released (status →
-- superseded) BEFORE the eligibility guard evaluates the new offer's
-- exposure, otherwise a same-size replacement could bounce off the
-- ceiling it is about to free. (Same-timing triggers fire in name
-- order.) The AFTER trigger then writes the forward link, atomically in
-- the same insert statement/transaction.
drop trigger if exists rental_invoices_supersede_replaced on public.rental_invoices;
drop trigger if exists rental_invoices_aa_supersede_replaced on public.rental_invoices;
create trigger rental_invoices_aa_supersede_replaced
  before insert on public.rental_invoices
  for each row execute function public.supersede_replaced_offer();

drop trigger if exists rental_invoices_zz_link_superseded on public.rental_invoices;
create trigger rental_invoices_zz_link_superseded
  after insert on public.rental_invoices
  for each row execute function public.link_superseded_offer();

-- ---------------------------------------------------------------------
-- 9. Closure requests: non-handover and customer-declared return
-- ---------------------------------------------------------------------
create or replace function public.request_contract_closure(
  p_contract_id uuid,
  p_kind public.closure_request_kind,
  p_declared_return_at timestamptz default null,
  p_note text default null,
  p_evidence_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_role public.app_role;
  v_existing uuid;
  v_id uuid;
  v_counterparty uuid;
  v_notice text;
begin
  select * into v_contract from rental_contracts
   where id = p_contract_id for update;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0020';
  end if;

  if v_contract.customer_user_id = auth.uid() then
    v_role := 'customer';
  elsif public.is_merchant_owner(v_contract.merchant_id) then
    v_role := 'merchant';
  else
    raise exception 'Not a party to this contract' using errcode = 'P0021';
  end if;

  -- Idempotency: a live request answers duplicates.
  select id into v_existing from contract_closure_requests
   where contract_id = p_contract_id and status in ('open', 'admin_review')
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_kind = 'non_handover' then
    if v_contract.status <> 'pending' then
      raise exception 'Non-handover closure applies to accepted, not-yet-activated contracts only'
        using errcode = 'P0025';
    end if;
    if v_contract.handover_at is not null
       or v_contract.receipt_photos_confirmed_at is not null
       or exists (select 1 from contract_receipt_photos p
                   where p.contract_id = p_contract_id) then
      raise exception 'Handover evidence exists — use the return path instead'
        using errcode = 'P0024';
    end if;
    v_notice := 'closure_requested';
  else
    if v_contract.status <> 'active' then
      raise exception 'Return can only be declared for an active rental'
        using errcode = 'P0026';
    end if;
    if v_role <> 'customer' then
      -- The merchant's path for a received return is close_rental_contract.
      raise exception 'Only the customer declares a return; merchants confirm receipt directly'
        using errcode = 'P0027';
    end if;
    v_notice := 'return_declared';
  end if;

  insert into contract_closure_requests
    (contract_id, kind, requested_by, requested_role,
     declared_return_at, request_note, evidence_path)
  values
    (p_contract_id, p_kind, auth.uid(), v_role,
     p_declared_return_at, p_note, p_evidence_path)
  returning id into v_id;

  perform log_contract_event(
    p_contract_id, v_contract.invoice_id, v_id,
    case p_kind when 'non_handover' then 'early_closure_requested'
                else 'return_declared' end,
    v_contract.status::text, v_contract.status::text,
    p_kind::text, p_note,
    jsonb_build_object('declared_return_at', p_declared_return_at,
                       'has_evidence', p_evidence_path is not null));

  v_counterparty := case when v_role = 'customer'
    then (select owner_user_id from merchants where id = v_contract.merchant_id)
    else v_contract.customer_user_id end;
  perform notify_party(v_counterparty, v_notice, v_contract.invoice_id,
                       v_contract.merchant_id,
                       jsonb_build_object('request_id', v_id, 'kind', p_kind));

  -- Tracked notice: queued ≠ delivered. The 48h deadline starts only
  -- when record_notice_delivery marks this delivered.
  insert into closure_notice_deliveries (request_id, notice)
  values (v_id, v_notice);

  return v_id;
end;
$$;
grant execute on function public.request_contract_closure(uuid, public.closure_request_kind, timestamptz, text, text)
  to authenticated;

create or replace function public.confirm_contract_closure(
  p_request_id uuid,
  p_note text default null
) returns public.contract_closure_reason
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req contract_closure_requests%rowtype;
  v_contract rental_contracts%rowtype;
  v_reason public.contract_closure_reason;
  v_is_admin boolean := public.is_admin();
  v_via public.contract_closure_via;
begin
  select * into v_req from contract_closure_requests
   where id = p_request_id for update;
  if not found then
    raise exception 'Closure request not found' using errcode = 'P0030';
  end if;
  if v_req.status not in ('open', 'admin_review') then
    raise exception 'Closure request already resolved (got %)', v_req.status
      using errcode = 'P0031';
  end if;
  if v_req.status = 'admin_review' and not v_is_admin then
    raise exception 'This request awaits administrative review' using errcode = 'P0034';
  end if;

  select * into v_contract from rental_contracts
   where id = v_req.contract_id for update;

  -- Confirmation must come from the COUNTERPARTY (or admin): the
  -- requester cannot confirm their own declaration.
  if not v_is_admin then
    if auth.uid() = v_req.requested_by then
      raise exception 'The counterparty must confirm this request' using errcode = 'P0032';
    end if;
    if not (v_contract.customer_user_id = auth.uid()
            or public.is_merchant_owner(v_contract.merchant_id)) then
      raise exception 'Not a party to this contract' using errcode = 'P0021';
    end if;
  end if;

  v_via := case when v_is_admin then 'admin' else 'mutual' end;
  if v_req.kind = 'non_handover' then
    v_reason := finalize_contract_closure(v_req.contract_id, v_via, p_note, 'pending');
  else
    v_reason := finalize_contract_closure(v_req.contract_id, v_via, p_note, 'active');
  end if;

  update contract_closure_requests
     set status = 'confirmed', responded_by = auth.uid(),
         responded_at = now(), response_note = p_note, resolved_at = now()
   where id = p_request_id;

  perform log_contract_event(
    v_req.contract_id, v_contract.invoice_id, p_request_id,
    'closure_confirmed', 'open', 'confirmed', v_reason::text, p_note, '{}'::jsonb);
  perform notify_party(v_req.requested_by, 'closure_confirmed',
                       v_contract.invoice_id, v_contract.merchant_id,
                       jsonb_build_object('reason', v_reason));
  return v_reason;
end;
$$;
grant execute on function public.confirm_contract_closure(uuid, text) to authenticated;

create or replace function public.object_contract_closure(
  p_request_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req contract_closure_requests%rowtype;
  v_contract rental_contracts%rowtype;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An objection requires a reason' using errcode = 'P0033';
  end if;
  select * into v_req from contract_closure_requests
   where id = p_request_id for update;
  if not found then
    raise exception 'Closure request not found' using errcode = 'P0030';
  end if;
  if v_req.status <> 'open' then
    raise exception 'Closure request already resolved (got %)', v_req.status
      using errcode = 'P0031';
  end if;
  select * into v_contract from rental_contracts
   where id = v_req.contract_id for update;
  if auth.uid() = v_req.requested_by
     or not (v_contract.customer_user_id = auth.uid()
             or public.is_merchant_owner(v_contract.merchant_id)) then
    raise exception 'Only the counterparty may object' using errcode = 'P0032';
  end if;

  -- Objection suspends any automatic path and routes to admin review.
  -- Financial/eligibility state is left exactly as it is.
  update contract_closure_requests
     set status = 'admin_review', responded_by = auth.uid(),
         responded_at = now(), response_note = p_reason
   where id = p_request_id;

  perform log_contract_event(
    v_req.contract_id, v_contract.invoice_id, p_request_id,
    'closure_objected', 'open', 'admin_review', p_reason, null, '{}'::jsonb);
  perform notify_party(v_req.requested_by, 'closure_objected',
                       v_contract.invoice_id, v_contract.merchant_id,
                       jsonb_build_object('request_id', p_request_id));
end;
$$;
grant execute on function public.object_contract_closure(uuid, text) to authenticated;

-- Admin resolution of exceptional cases (objections / blocked requests).
create or replace function public.admin_resolve_closure_request(
  p_request_id uuid,
  p_action text,          -- 'close' | 'void'
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req contract_closure_requests%rowtype;
  v_contract rental_contracts%rowtype;
  v_reason public.contract_closure_reason;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = 'P0040';
  end if;
  if p_action not in ('close', 'void') then
    raise exception 'Unknown action %', p_action using errcode = 'P0041';
  end if;
  select * into v_req from contract_closure_requests
   where id = p_request_id for update;
  if not found then
    raise exception 'Closure request not found' using errcode = 'P0030';
  end if;
  if v_req.status not in ('open', 'admin_review') then
    raise exception 'Closure request already resolved (got %)', v_req.status
      using errcode = 'P0031';
  end if;
  select * into v_contract from rental_contracts
   where id = v_req.contract_id for update;

  if p_action = 'close' then
    v_reason := finalize_contract_closure(
      v_req.contract_id, 'admin', p_note,
      (case when v_req.kind = 'non_handover' then 'pending' else 'active' end)::public.contract_status);
    update contract_closure_requests
       set status = 'confirmed', responded_by = auth.uid(),
           responded_at = now(), response_note = p_note, resolved_at = now()
     where id = p_request_id;
  else
    update contract_closure_requests
       set status = 'voided', responded_by = auth.uid(),
           responded_at = now(), response_note = p_note, resolved_at = now()
     where id = p_request_id;
  end if;

  perform log_contract_event(
    v_req.contract_id, v_contract.invoice_id, p_request_id,
    'closure_admin_resolved', v_req.status::text,
    case when p_action = 'close' then 'confirmed' else 'voided' end,
    p_action, p_note, '{}'::jsonb);
  perform notify_party(v_req.requested_by, 'closure_admin_resolved',
                       v_contract.invoice_id, v_contract.merchant_id, '{}'::jsonb);
  perform notify_party(
    case when v_req.requested_role = 'customer'
         then (select owner_user_id from merchants where id = v_contract.merchant_id)
         else v_contract.customer_user_id end,
    'closure_admin_resolved', v_contract.invoice_id, v_contract.merchant_id, '{}'::jsonb);
end;
$$;
grant execute on function public.admin_resolve_closure_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Delivery recording + the 48h scheduler (service-role only)
-- ---------------------------------------------------------------------
-- Marks a tracked notice delivered/failed. The FIRST verified delivery
-- of the return_declared notice starts the 48h clock. Queued rows never
-- start it — per the approved rule, insertion is not delivery proof.
create or replace function public.record_notice_delivery(
  p_delivery_id uuid,
  p_status text,                -- 'delivered' | 'failed'
  p_provider_ref text default null,
  p_failure_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d closure_notice_deliveries%rowtype;
  v_req contract_closure_requests%rowtype;
begin
  if p_status not in ('delivered', 'failed') then
    raise exception 'Unknown delivery status %', p_status using errcode = 'P0050';
  end if;
  select * into v_d from closure_notice_deliveries
   where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery record not found' using errcode = 'P0051';
  end if;

  update closure_notice_deliveries
     set status = p_status,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         failed_at    = case when p_status = 'failed' then now() else failed_at end,
         failure_reason = coalesce(p_failure_reason, failure_reason)
   where id = p_delivery_id;

  if p_status = 'delivered' and v_d.notice = 'return_declared' then
    select * into v_req from contract_closure_requests
     where id = v_d.request_id for update;
    if v_req.deadline_at is null and v_req.status = 'open' then
      update contract_closure_requests
         set deadline_at = now() + interval '48 hours'
       where id = v_d.request_id;
      perform log_contract_event(
        v_req.contract_id, null, v_req.id, 'notice_delivered',
        null, null, 'deadline_started',
        null, jsonb_build_object('deadline_at', now() + interval '48 hours'));
    end if;
  end if;
end;
$$;
revoke all on function public.record_notice_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_notice_delivery(uuid, text, text, text) to service_role;

-- Scheduler body: reminders + (flag-gated) automatic closure. Intended
-- caller: a future cron/Edge job with the service key. Every blocking
-- condition is re-checked at execution time under row locks — never
-- from the scheduling snapshot. Safe to re-run: all transitions are
-- status-gated, so retries repeat no side effects.
create or replace function public.process_return_declarations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag boolean := coalesce(
    (platform_setting('auto_return_closure')->>'enabled')::boolean, false);
  r record;
  v_contract rental_contracts%rowtype;
  v_reminders int := 0;
  v_closed int := 0;
  v_blocked int := 0;
  v_reason public.contract_closure_reason;
begin
  for r in
    select * from contract_closure_requests
     where kind = 'return_declared' and status = 'open'
       and deadline_at is not null
     for update skip locked
  loop
    -- Reminders (T-24h and T-4h), one each, tracked as notices.
    if now() >= r.deadline_at - interval '24 hours'
       and r.reminder_24_sent_at is null then
      select * into v_contract from rental_contracts where id = r.contract_id;
      perform notify_party((select owner_user_id from merchants where id = v_contract.merchant_id),
                           'return_reminder', v_contract.invoice_id, v_contract.merchant_id,
                           jsonb_build_object('request_id', r.id, 'deadline_at', r.deadline_at));
      insert into closure_notice_deliveries (request_id, notice) values (r.id, 'reminder_24h');
      update contract_closure_requests set reminder_24_sent_at = now() where id = r.id;
      v_reminders := v_reminders + 1;
    end if;
    if now() >= r.deadline_at - interval '4 hours'
       and r.reminder_final_sent_at is null then
      select * into v_contract from rental_contracts where id = r.contract_id;
      perform notify_party((select owner_user_id from merchants where id = v_contract.merchant_id),
                           'return_final_warning', v_contract.invoice_id, v_contract.merchant_id,
                           jsonb_build_object('request_id', r.id, 'deadline_at', r.deadline_at));
      insert into closure_notice_deliveries (request_id, notice) values (r.id, 'final_warning');
      update contract_closure_requests set reminder_final_sent_at = now() where id = r.id;
      v_reminders := v_reminders + 1;
    end if;

    -- Automatic procedural closure — only past the verified deadline,
    -- only with the feature enabled, and only when EVERY blocking
    -- condition passes right now.
    if now() >= r.deadline_at then
      if not v_flag then
        v_blocked := v_blocked + 1;
        continue;  -- feature disabled: leave open, no event spam
      end if;
      select * into v_contract from rental_contracts
       where id = r.contract_id for update;
      if v_contract.status <> 'active' then
        update contract_closure_requests set status = 'voided',
               response_note = 'contract no longer active', resolved_at = now()
         where id = r.id;
        perform log_contract_event(r.contract_id, v_contract.invoice_id, r.id,
          'auto_closure_blocked', null, null, 'contract_not_active', null, '{}'::jsonb);
        v_blocked := v_blocked + 1;
        continue;
      end if;
      if exists (select 1 from damage_cases dc
                  where dc.contract_id = r.contract_id
                    and dc.status in ('open', 'escalated')) then
        perform log_contract_event(r.contract_id, v_contract.invoice_id, r.id,
          'auto_closure_blocked', null, null, 'open_damage_case', null, '{}'::jsonb);
        v_blocked := v_blocked + 1;
        continue;
      end if;
      if is_high_value_contract(v_contract) then
        update contract_closure_requests set status = 'admin_review',
               response_note = 'high-value policy: administrative review required'
         where id = r.id;
        perform log_contract_event(r.contract_id, v_contract.invoice_id, r.id,
          'auto_closure_blocked', 'open', 'admin_review', 'high_value_policy', null, '{}'::jsonb);
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Procedural confirmation due to merchant non-response — recorded
      -- as such, never as physical proof of receipt.
      v_reason := finalize_contract_closure(
        r.contract_id, 'auto',
        'آلي: انقضاء مهلة 48 ساعة دون رد التاجر — تأكيد إجرائي لا يُعد إثبات استلام مادي',
        'active');
      update contract_closure_requests
         set status = 'auto_closed', resolved_at = now()
       where id = r.id;
      perform log_contract_event(r.contract_id, v_contract.invoice_id, r.id,
        'auto_closure_executed', 'open', 'auto_closed',
        'merchant_non_response', null,
        jsonb_build_object('procedural_only', true, 'reason', v_reason));
      v_closed := v_closed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'flag_enabled', v_flag, 'reminders_sent', v_reminders,
    'auto_closed', v_closed, 'blocked_or_skipped', v_blocked,
    'ran_at', now());
end;
$$;
revoke all on function public.process_return_declarations()
  from public, anon, authenticated;
grant execute on function public.process_return_declarations() to service_role;

-- ---------------------------------------------------------------------
-- 11. close_rental_contract — signature migration (uuid) → (uuid, text)
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE with a new parameter would create an OVERLOAD and
-- make PostgREST calls ambiguous. Strategy: drop the single old
-- signature and create the new one with a DEFAULT, so every existing
-- caller ({p_contract_id}) keeps working against exactly one function.
-- Ownership stays with the migration role; execute is re-granted
-- explicitly (drop discards the old ACL).
drop function if exists public.close_rental_contract(uuid);

create function public.close_rental_contract(
  p_contract_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
begin
  select * into v_contract from rental_contracts
   where id = p_contract_id for update;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0020';
  end if;
  if not (public.is_admin() or public.is_merchant_owner(v_contract.merchant_id)) then
    raise exception 'Not authorized to close this contract' using errcode = 'P0021';
  end if;
  -- Idempotent, exactly like the previous version.
  if v_contract.status <> 'active' then
    return;
  end if;

  perform finalize_contract_closure(p_contract_id, 'merchant', p_note, 'active');

  -- A merchant close resolves any live return declaration for the same
  -- contract (the merchant's confirmation IS the response).
  update contract_closure_requests
     set status = 'confirmed', responded_by = auth.uid(),
         responded_at = now(), resolved_at = now(),
         response_note = coalesce(response_note, 'merchant closed directly')
   where contract_id = p_contract_id and status = 'open';
end;
$$;
grant execute on function public.close_rental_contract(uuid, text) to authenticated;

comment on function public.close_rental_contract(uuid, text) is
  'Merchant/admin closure of an active rental. Reason is server-derived (returned / returned_early by clock vs end_date); optional inspection note persisted to rental_contracts.closure_note. Blocks on open damage cases; releases eligibility per 20260502124600 math; resolves any live return declaration. Replaces the (uuid) signature from 20260502124600 — single function, no PostgREST overload ambiguity (20260502130600).';
