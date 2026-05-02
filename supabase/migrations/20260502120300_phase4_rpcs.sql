-- =====================================================================
-- AppLux MVP — Phase 4 RPCs
-- =====================================================================
-- Two SECURITY DEFINER functions that wrap multi-step operations the
-- client cannot perform under default RLS:
--
--   * accept_rental_invoice(p_invoice_id) — customer accepts an issued
--     invoice; creates a rental_contract + promissory_note, marks the
--     invoice 'accepted', and bumps rental_eligibility.used_amount.
--     (The customer's RLS policy on rental_eligibility is read-only;
--     this function performs the bump on their behalf.)
--
--   * provision_merchant_from_application(p_application_id) — admin
--     finalizes an approved application by creating the matching
--     merchants row and lifting profiles.role to 'merchant'.
--
-- Both functions check the caller's role / ownership before acting.
-- =====================================================================

-- ---------------------------------------------------------------------
-- accept_rental_invoice
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
  v_note_id          uuid;
  v_contract_number  text;
  v_note_number      text;
  v_beneficiary      text;
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

  v_contract_number := next_contract_number();
  v_note_number     := next_note_number();

  select company_name into v_beneficiary
  from merchants
  where id = v_invoice.merchant_id;

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    current_date, current_date + interval '30 days',
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount,
    'active', now()
  )
  returning id into v_contract_id;

  insert into promissory_notes (
    reference_number, contract_id, customer_user_id, merchant_id,
    beneficiary_name, principal_amount, due_date,
    status, signed_at
  )
  values (
    v_note_number, v_contract_id, v_invoice.customer_user_id, v_invoice.merchant_id,
    coalesce(v_beneficiary, 'AppLux Partner'),
    v_invoice.total_amount + coalesce(v_invoice.security_deposit, 0),
    current_date + interval '60 days',
    'signed', now()
  )
  returning id into v_note_id;

  update rental_invoices
  set status = 'accepted', updated_at = now()
  where id = p_invoice_id;

  -- Best-effort eligibility bump. Eligibility row may not exist yet for
  -- brand-new customers; that's fine — admin assigns one out of band.
  update rental_eligibility
  set used_amount = least(used_amount + v_invoice.total_amount, limit_amount),
      updated_at = now()
  where user_id = v_invoice.customer_user_id;

  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- provision_merchant_from_application
-- ---------------------------------------------------------------------

create or replace function public.provision_merchant_from_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app          merchant_applications%rowtype;
  v_merchant_id  uuid;
begin
  if not is_admin() then
    raise exception 'Admin only' using errcode = 'P0010';
  end if;

  select * into v_app from merchant_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found' using errcode = 'P0011';
  end if;

  if v_app.status <> 'approved' then
    raise exception 'Application must be approved before provisioning'
      using errcode = 'P0012';
  end if;

  -- Idempotent: skip if already provisioned.
  select id into v_merchant_id
  from merchants
  where application_id = p_application_id;

  if v_merchant_id is null then
    insert into merchants (
      owner_user_id, application_id,
      company_name, commercial_reg_number,
      display_name, primary_category, city,
      status, approved_at, approved_by
    )
    values (
      v_app.applicant_user_id, p_application_id,
      v_app.company_name, v_app.commercial_reg_number,
      jsonb_build_object('ar', v_app.company_name, 'en', v_app.company_name),
      v_app.primary_category, v_app.city,
      'active', now(), auth.uid()
    )
    returning id into v_merchant_id;
  end if;

  update profiles
  set role = 'merchant',
      account_status = 'active',
      updated_at = now()
  where id = v_app.applicant_user_id
    and role <> 'admin';

  return v_merchant_id;
end;
$$;

grant execute on function public.provision_merchant_from_application(uuid) to authenticated;
