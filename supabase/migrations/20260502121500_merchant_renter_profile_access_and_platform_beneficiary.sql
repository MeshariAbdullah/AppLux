-- =====================================================================
-- Phase 8c — merchant renter profile access + platform beneficiary
-- =====================================================================
-- Two related corrections.
--
-- 1) Merchants couldn't read their own customers' profiles
--    The profiles RLS policies only covered:
--      * profiles_self_select   (auth.uid() = id)
--      * profiles_admin_select  (is_admin())
--    So a merchant calling fetchProfile(contract.customer_user_id) on
--    the rental detail / contract / note pages got `null`, and the
--    renter row rendered blank. Add an explicit policy: a merchant
--    can SELECT a customer profile when they have an invoice or
--    contract with that customer. Scoped narrowly to those two
--    relationships.
--
-- 2) The promissory note's beneficiary was the merchant
--    Per the corrected product flow:
--        Contract  :  merchant  ↔  renter
--        Note      :  platform  ↔  renter   (platform = Lend)
--    record_rental_payment used to persist
--      beneficiary_name = merchants.company_name
--    which embedded the merchant as the obligee. Switch the persisted
--    beneficiary to the platform's legal entity name. Existing rows
--    are unaffected — UI also resolves the beneficiary to the same
--    constant, so legacy notes display the correct entity regardless
--    of what they stored.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) RLS — merchant can read profile rows for their known renters
-- ---------------------------------------------------------------------

drop policy if exists profiles_merchant_known_renter_select on public.profiles;
create policy profiles_merchant_known_renter_select on public.profiles
  for select using (
    exists (
      select 1 from public.rental_contracts c
      where c.customer_user_id = profiles.id
        and public.is_merchant_owner(c.merchant_id)
    )
    or exists (
      select 1 from public.rental_invoices i
      where i.customer_user_id = profiles.id
        and public.is_merchant_owner(i.merchant_id)
    )
  );

-- ---------------------------------------------------------------------
-- (2) record_rental_payment — beneficiary is the platform legal entity
-- ---------------------------------------------------------------------

create or replace function public.record_rental_payment(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice       rental_invoices%rowtype;
  v_contract      rental_contracts%rowtype;
  v_note_id       uuid;
  v_note_number   text;
begin
  select * into v_invoice from rental_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0030';
  end if;

  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only record payment for your own invoice'
      using errcode = 'P0031';
  end if;

  if v_invoice.status <> 'accepted' then
    raise exception 'Invoice must be accepted before payment (got %)', v_invoice.status
      using errcode = 'P0032';
  end if;

  select * into v_contract
  from rental_contracts
  where invoice_id = v_invoice.id;
  if not found then
    raise exception 'Contract not found for this invoice' using errcode = 'P0033';
  end if;

  -- Idempotency: reuse the existing note if one is already created.
  select id into v_note_id
  from promissory_notes
  where contract_id = v_contract.id;

  if v_note_id is null then
    v_note_number := next_note_number();
    -- Beneficiary is the platform legal entity, not the merchant.
    -- The note is between Lend and the renter; the merchant is the
    -- counterparty on the CONTRACT, not on the note.
    insert into promissory_notes (
      reference_number, contract_id, customer_user_id, merchant_id,
      beneficiary_name, principal_amount, due_date,
      status, signed_at
    )
    values (
      v_note_number, v_contract.id, v_invoice.customer_user_id, v_invoice.merchant_id,
      'شركة ليند تيكنولوجيز',
      v_invoice.total_amount + coalesce(v_invoice.security_deposit, 0),
      current_date + interval '60 days',
      'pending', null
    )
    returning id into v_note_id;
  end if;

  return v_note_id;
end;
$$;

grant execute on function public.record_rental_payment(uuid) to authenticated;
