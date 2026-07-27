-- =====================================================================
-- Eligibility reservation for pending offers
-- =====================================================================
-- BUG (audited): nothing reserved eligibility for offers awaiting the
-- customer's review. rental_eligibility.used_amount is authoritative
-- COMMITTED exposure, incremented only at ACTIVATION
-- (activate_rental_without_payment_and_note, by v_hold =
-- coalesce(nullif(original_item_value,0), total_amount)) and released
-- on close/damage by original_item_value. Offer issuance is a direct
-- client INSERT with no server check at all, so several offers whose
-- combined exposure exceeds limit_amount could all be issued AND
-- accepted.
--
-- MODEL (design A — dynamic, single source of truth, race-safe):
-- reservations are DERIVED from rental_invoices; no ledger table, no
-- second copy of any amount, nothing to drift.
--
--   reserved(user) = Σ exposure over invoices of that user where
--     * not expired (expires_at null or in the future), and
--     * status in ('issued','viewed')                      — awaiting
--       review, or
--     * status = 'accepted' AND its contract is 'pending'  — accepted
--       but not yet activated. used_amount only rises at ACTIVATION
--       (the existing approved commit point), so acceptance keeps the
--       reservation and activation atomically swaps reserved →
--       committed inside the activation transaction (contract flips
--       to 'active' — leaving the reserved set — in the same
--       statement batch that bumps used_amount). Never both.
--
--   exposure(invoice) = coalesce(nullif(original_item_value,0),
--                                total_amount)
--     — EXACTLY the activation hold basis (v_hold), so reserved and
--       committed use one approved monetary basis: the item /
--       replacement value, falling back to the invoice total.
--
--   available(user) = limit_amount − used_amount − reserved(user)
--
-- Lifecycle mapping to the real enums (invoice_status / contract_status):
--   draft                → not reserved, not committed
--   issued / viewed      → RESERVED
--   expired (expires_at) → released automatically (time-based)
--   rejected/cancelled/superseded → released automatically
--   accepted + contract 'pending'  → still RESERVED (pre-activation)
--   accepted + contract 'active'   → COMMITTED via used_amount
--   accepted + contract 'cancelled'→ released (never activated)
--   ended/closed         → released from used_amount by the EXISTING
--                          close/damage RPCs (untouched here)
--
-- ENFORCEMENT (server-side, concurrency-safe):
--   * BEFORE trigger on rental_invoices for INSERT-as-issued/viewed
--     and for transitions INTO issued/viewed: locks the customer's
--     rental_eligibility row FOR UPDATE, recomputes committed +
--     reserved inside the same transaction, raises P0160 when the new
--     offer's exposure exceeds the available balance. The row lock
--     serializes concurrent merchants issuing to the same customer —
--     the second transaction waits, re-evaluates, and fails.
--   * accept_rental_invoice gains the same lock + check as a customer-
--     side backstop (P0161) — acceptance normally adds no NEW
--     exposure (the offer is already reserved), so this only fires if
--     the limit shrank or data changed after issuance.
--   SECURITY DEFINER on both: the sum must see OTHER merchants'
--   invoices for the same customer, which caller RLS hides.
--
-- Missing eligibility row → P0160 (defaults create one for every
-- customer at signup; a missing row means the customer cannot rent).
--
-- READ MODELS:
--   * get_renter_eligibility (merchant/admin) — recreated to also
--     return reserved_amount + available_amount (additive; old
--     clients ignore the new keys).
--   * get_my_eligibility_breakdown() — customer self-service summary
--     for the eligibility page (limit / used / reserved).
--
-- BACKFILL: none needed — reservations are derived, so existing
-- actionable pending offers start consuming balance the moment this
-- is applied. Existing over-limit customers (committed + pending >
-- limit) are NOT auto-cancelled: their available balance clamps at 0
-- and new offers are refused until exposure falls. Ops audit query
-- (read-only) is included at the bottom, commented.
--
-- Idempotent. ROLLBACK: drop trigger + functions; re-apply the
-- 20260502123500 body of accept_rental_invoice.
-- =====================================================================

-- Supports the reserved-sum scan.
create index if not exists rental_invoices_customer_status_idx
  on public.rental_invoices(customer_user_id, status);

-- ---------------------------------------------------------------------
-- (1) Reserved exposure — THE definition, shared by trigger/RPCs.
-- ---------------------------------------------------------------------
create or replace function public.eligibility_reserved_amount(
  p_user uuid,
  p_exclude_invoice uuid default null
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(coalesce(nullif(i.original_item_value, 0), i.total_amount)), 0)
    from public.rental_invoices i
   where i.customer_user_id = p_user
     and (p_exclude_invoice is null or i.id <> p_exclude_invoice)
     and (i.expires_at is null or i.expires_at > now())
     and (
       i.status in ('issued', 'viewed')
       or (
         i.status = 'accepted'
         and exists (
           select 1 from public.rental_contracts c
            where c.invoice_id = i.id and c.status = 'pending'
         )
       )
     )
$$;

comment on function public.eligibility_reserved_amount(uuid, uuid) is
  'Derived offer reservations: exposure (original_item_value fallback total_amount) of non-expired issued/viewed invoices plus accepted invoices whose contract is still pending (pre-activation). Same basis as the activation hold.';

-- ---------------------------------------------------------------------
-- (2) Issuance guard — P0160
-- ---------------------------------------------------------------------
create or replace function public.enforce_customer_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit    numeric;
  v_used     numeric;
  v_reserved numeric;
  v_exposure numeric;
  v_entering boolean;
begin
  -- Only when the row ENTERS a customer-reviewable state.
  v_entering :=
    new.status in ('issued', 'viewed')
    and (tg_op = 'INSERT' or old.status not in ('issued', 'viewed'));
  if not v_entering then
    return new;
  end if;

  -- Serialize against concurrent issuance/acceptance for this customer.
  select limit_amount, used_amount
    into v_limit, v_used
    from rental_eligibility
   where user_id = new.customer_user_id
     for update;

  if not found then
    raise exception 'Customer has no rental eligibility'
      using errcode = 'P0160';
  end if;

  v_exposure := coalesce(nullif(new.original_item_value, 0), new.total_amount, 0);
  v_reserved := eligibility_reserved_amount(new.customer_user_id, new.id);

  if v_exposure > v_limit - v_used - v_reserved then
    raise exception
      'Offer exposure % exceeds available eligibility (limit %, used %, reserved %)',
      v_exposure, v_limit, v_used, v_reserved
      using errcode = 'P0160';
  end if;

  return new;
end;
$$;

drop trigger if exists rental_invoices_eligibility_guard on public.rental_invoices;
create trigger rental_invoices_eligibility_guard
  before insert or update of status on public.rental_invoices
  for each row
  execute function public.enforce_customer_eligibility();

comment on function public.enforce_customer_eligibility() is
  'Server-side offer reservation: entering issued/viewed locks the customer eligibility row and rejects the offer (P0160) when its exposure exceeds limit − used − reserved.';

-- ---------------------------------------------------------------------
-- (3) Acceptance backstop — P0161 (body extends 20260502123500)
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

  -- Eligibility backstop: this invoice is already reserved, so accept
  -- normally adds nothing — the check only fires when the limit shrank
  -- or exposure changed since issuance. Locks the same row the
  -- issuance guard locks, serializing with concurrent offers.
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
  'Accept issued/viewed invoice → pending contract (LND ref + party snapshots). P0150 incomplete identity; P0161 eligibility backstop; P0001/2/3 unchanged. Reservation continues until activation commits used_amount.';

-- ---------------------------------------------------------------------
-- (4) Merchant/admin read model — reserved + available added.
--     (Return-shape change requires drop; additive keys for clients.)
-- ---------------------------------------------------------------------
drop function if exists public.get_renter_eligibility(uuid);
create function public.get_renter_eligibility(p_renter_id uuid)
returns table (
  user_id          uuid,
  limit_amount     numeric,
  used_amount      numeric,
  reserved_amount  numeric,
  available_amount numeric,
  tier             public.eligibility_tier
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can read renter eligibility' using errcode = 'P0030';
  end if;

  return query
  select e.user_id,
         e.limit_amount,
         e.used_amount,
         public.eligibility_reserved_amount(e.user_id) as reserved_amount,
         greatest(
           0,
           e.limit_amount - e.used_amount
             - public.eligibility_reserved_amount(e.user_id)
         ) as available_amount,
         e.tier
    from public.rental_eligibility e
   where e.user_id = p_renter_id;
end;
$$;

grant execute on function public.get_renter_eligibility(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (5) Customer self-service breakdown (eligibility page).
-- ---------------------------------------------------------------------
create or replace function public.get_my_eligibility_breakdown()
returns table (
  limit_amount     numeric,
  used_amount      numeric,
  reserved_amount  numeric,
  available_amount numeric,
  tier             public.eligibility_tier
)
language sql
stable
security definer
set search_path = public
as $$
  select e.limit_amount,
         e.used_amount,
         public.eligibility_reserved_amount(e.user_id),
         greatest(
           0,
           e.limit_amount - e.used_amount
             - public.eligibility_reserved_amount(e.user_id)
         ),
         e.tier
    from public.rental_eligibility e
   where e.user_id = auth.uid()
$$;

grant execute on function public.get_my_eligibility_breakdown() to authenticated;

-- ---------------------------------------------------------------------
-- Ops audit (READ-ONLY, run manually if desired): customers whose
-- committed + actionable pending exposure already exceeds the limit.
-- ---------------------------------------------------------------------
-- select e.user_id, e.limit_amount, e.used_amount,
--        public.eligibility_reserved_amount(e.user_id) as reserved,
--        e.used_amount + public.eligibility_reserved_amount(e.user_id)
--          - e.limit_amount as over_by
--   from public.rental_eligibility e
--  where e.used_amount + public.eligibility_reserved_amount(e.user_id)
--        > e.limit_amount;

notify pgrst, 'reload schema';
