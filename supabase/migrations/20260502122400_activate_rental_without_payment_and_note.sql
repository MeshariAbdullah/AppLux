-- =====================================================================
-- Current-phase rental activation — WITHOUT payment / promissory note /
-- Nafath (approved design, journey-simplification phase).
-- =====================================================================
-- Product decision: in the current phase the customer reviews and
-- approves the offer + contract, and the rental activates immediately.
-- No payment records, no promissory-note rows, and no Nafath/Nafith
-- signing stamps may be created — the customer never saw or approved
-- those instruments, so no such data may exist for these rentals.
--
-- This migration is PURELY ADDITIVE: one new SECURITY DEFINER function.
-- The legacy simulated chain (record_rental_payment →
-- record_nafath_signing → verify_and_activate_rental) is untouched and
-- remains callable; the client hides it behind
-- ENABLE_PAYMENTS_AND_NOTES = false (src/lib/featureFlags.ts).
--
-- Eligibility-hold semantics (approved): the hold is the ORIGINAL ITEM
-- VALUE — the same amount close_rental_contract and the damage trigger
-- release — sourced from the contract mirror, else the invoice, with
-- total_amount as a legacy-rows-only fallback. The rental fee is NOT
-- the hold.
--
-- ---------------------------------------------------------------------
-- KNOWN TECHNICAL DEBT (documented, NOT fixed here — needs separate
-- approval): the legacy simulated path has two defects this function
-- deliberately does not inherit:
--   D1: verify_and_activate_rental bumps used_amount by TOTAL_AMOUNT
--       (rental fee) while close/damage decrement ORIGINAL_ITEM_VALUE.
--   D2: accept_rental_invoice (since 20260502121300 revisions) stopped
--       mirroring original_item_value onto rental_contracts, so
--       close/damage on those contracts decrement 0.
-- Contracts activated through the LEGACY path therefore leave
-- eligibility used_amount skewed until remediated. Remediation of
-- existing rows requires an approved backfill (see the implementation
-- report accompanying this migration); do not "fix" it ad hoc.
-- ---------------------------------------------------------------------
--
-- ROLLBACK: this feature is reverted by
--   (1) flipping ENABLE_PAYMENTS_AND_NOTES back to true in the client,
--   (2) optionally: drop function public.activate_rental_without_payment_and_note(uuid);
-- Contracts activated by this function are plain 'active' contracts
-- with a standard eligibility hold — they remain fully valid under the
-- legacy flow after rollback. No data rewrite is needed.
-- =====================================================================

create or replace function public.activate_rental_without_payment_and_note(
  p_contract_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_invoice  rental_invoices%rowtype;
  v_hold     numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;

  -- Row lock: concurrent calls (double-tap, retry racing the first
  -- attempt) serialize here; the loser sees 'active' below and returns
  -- idempotently without re-applying the hold.
  select * into v_contract
  from rental_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contract not found' using errcode = 'P0091';
  end if;

  if v_contract.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only activate your own contract'
      using errcode = 'P0092';
  end if;

  -- Idempotent success: already active — via this RPC (a retry) or via
  -- the legacy simulated flow. No second hold, no error.
  if v_contract.status = 'active' then
    return v_contract.id;
  end if;

  if v_contract.status <> 'pending' then
    raise exception 'Contract is not awaiting activation (got %)',
      v_contract.status using errcode = 'P0093';
  end if;

  select * into v_invoice
  from rental_invoices
  where id = v_contract.invoice_id;

  -- Hold amount = note-principal semantics (original item value), with
  -- the invoice as the source when the contract mirror is missing (D2)
  -- and total_amount only for legacy rows that predate the column.
  v_hold := coalesce(
    nullif(v_contract.original_item_value, 0),
    nullif(v_invoice.original_item_value, 0),
    v_contract.total_amount
  );

  -- pending → active. start_date / end_date are untouched (set at
  -- acceptance from the merchant's starts_at). The original_item_value
  -- mirror is repaired when missing so the close / damage decrement
  -- releases EXACTLY the amount held here.
  update rental_contracts
  set status              = 'active',
      signed_at           = coalesce(signed_at, now()),
      original_item_value = case
        when coalesce(original_item_value, 0) = 0 then v_hold
        else original_item_value
      end,
      updated_at          = now()
  where id = v_contract.id;

  -- Apply the eligibility hold EXACTLY once — guarded by the row-locked
  -- pending→active transition above. least() cap matches the existing
  -- activation; a missing eligibility row is a soft no-op, matching
  -- current behavior for brand-new customers.
  update rental_eligibility
  set used_amount = least(used_amount + v_hold, limit_amount),
      updated_at  = now()
  where user_id = v_contract.customer_user_id;

  return v_contract.id;
end;
$$;

grant execute on function public.activate_rental_without_payment_and_note(uuid)
  to authenticated;
