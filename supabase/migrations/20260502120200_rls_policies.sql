-- =====================================================================
-- AppLux MVP — Phase 1 Row-Level Security policies
-- =====================================================================
-- Access model:
--   * customer  — reads/writes only their own profile, eligibility,
--                 invoices, contracts, notes, damage cases, evidence.
--                 Reads active merchants + branches publicly for browsing.
--   * merchant  — reads/writes invoices/contracts/notes/cases bound to
--                 their merchant id. Reads/updates their own merchant +
--                 branches. Reads customer profile fields linked to
--                 their rentals (limited surface; expanded in Phase 2).
--   * admin     — full read across all tables, write on lifecycle/control
--                 tables (merchant_applications.status, merchants.status,
--                 rental_eligibility, damage_cases.stage/status).
--
-- Helpers used: public.is_admin(), public.is_merchant_owner(uuid).
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.merchant_applications  enable row level security;
alter table public.merchants              enable row level security;
alter table public.merchant_branches      enable row level security;
alter table public.rental_eligibility     enable row level security;
alter table public.rental_invoices        enable row level security;
alter table public.rental_invoice_items   enable row level security;
alter table public.rental_contracts       enable row level security;
alter table public.promissory_notes       enable row level security;
alter table public.damage_cases           enable row level security;
alter table public.damage_evidence        enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);

create policy profiles_admin_select on public.profiles
  for select using (public.is_admin());

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- merchant_applications
-- ---------------------------------------------------------------------
create policy merchant_applications_self_select on public.merchant_applications
  for select using (auth.uid() = applicant_user_id);

create policy merchant_applications_admin_select on public.merchant_applications
  for select using (public.is_admin());

create policy merchant_applications_self_insert on public.merchant_applications
  for insert with check (auth.uid() = applicant_user_id);

create policy merchant_applications_admin_update on public.merchant_applications
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- merchants — public can browse active boutiques
-- ---------------------------------------------------------------------
create policy merchants_public_select on public.merchants
  for select using (status = 'active');

create policy merchants_owner_select on public.merchants
  for select using (auth.uid() = owner_user_id);

create policy merchants_admin_select on public.merchants
  for select using (public.is_admin());

create policy merchants_owner_update on public.merchants
  for update using (auth.uid() = owner_user_id)
              with check (auth.uid() = owner_user_id);

create policy merchants_admin_update on public.merchants
  for update using (public.is_admin()) with check (public.is_admin());

create policy merchants_admin_insert on public.merchants
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------
-- merchant_branches — public can browse branches of active merchants
-- ---------------------------------------------------------------------
create policy merchant_branches_public_select on public.merchant_branches
  for select using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_branches.merchant_id and m.status = 'active'
    )
  );

create policy merchant_branches_owner_all on public.merchant_branches
  for all using (public.is_merchant_owner(merchant_id))
         with check (public.is_merchant_owner(merchant_id));

create policy merchant_branches_admin_all on public.merchant_branches
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- rental_eligibility
-- ---------------------------------------------------------------------
create policy rental_eligibility_self_select on public.rental_eligibility
  for select using (auth.uid() = user_id);

create policy rental_eligibility_admin_all on public.rental_eligibility
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- rental_invoices
-- ---------------------------------------------------------------------
create policy rental_invoices_customer_select on public.rental_invoices
  for select using (auth.uid() = customer_user_id);

create policy rental_invoices_merchant_select on public.rental_invoices
  for select using (public.is_merchant_owner(merchant_id));

create policy rental_invoices_admin_select on public.rental_invoices
  for select using (public.is_admin());

create policy rental_invoices_merchant_insert on public.rental_invoices
  for insert with check (public.is_merchant_owner(merchant_id));

create policy rental_invoices_merchant_update on public.rental_invoices
  for update using (public.is_merchant_owner(merchant_id))
              with check (public.is_merchant_owner(merchant_id));

-- Customer can update only their own invoice (e.g. accept/reject status)
create policy rental_invoices_customer_update on public.rental_invoices
  for update using (auth.uid() = customer_user_id)
              with check (auth.uid() = customer_user_id);

create policy rental_invoices_admin_update on public.rental_invoices
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- rental_invoice_items — access mirrors parent invoice
-- ---------------------------------------------------------------------
create policy rental_invoice_items_select on public.rental_invoice_items
  for select using (
    exists (
      select 1 from public.rental_invoices i
      where i.id = rental_invoice_items.invoice_id
        and (
          i.customer_user_id = auth.uid()
          or public.is_merchant_owner(i.merchant_id)
          or public.is_admin()
        )
    )
  );

create policy rental_invoice_items_merchant_write on public.rental_invoice_items
  for all using (
    exists (
      select 1 from public.rental_invoices i
      where i.id = rental_invoice_items.invoice_id
        and public.is_merchant_owner(i.merchant_id)
    )
  )
  with check (
    exists (
      select 1 from public.rental_invoices i
      where i.id = rental_invoice_items.invoice_id
        and public.is_merchant_owner(i.merchant_id)
    )
  );

create policy rental_invoice_items_admin_all on public.rental_invoice_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- rental_contracts
-- ---------------------------------------------------------------------
create policy rental_contracts_customer_select on public.rental_contracts
  for select using (auth.uid() = customer_user_id);

create policy rental_contracts_merchant_select on public.rental_contracts
  for select using (public.is_merchant_owner(merchant_id));

create policy rental_contracts_admin_select on public.rental_contracts
  for select using (public.is_admin());

create policy rental_contracts_merchant_insert on public.rental_contracts
  for insert with check (public.is_merchant_owner(merchant_id));

create policy rental_contracts_merchant_update on public.rental_contracts
  for update using (public.is_merchant_owner(merchant_id))
              with check (public.is_merchant_owner(merchant_id));

create policy rental_contracts_admin_all on public.rental_contracts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- promissory_notes
-- ---------------------------------------------------------------------
create policy promissory_notes_customer_select on public.promissory_notes
  for select using (auth.uid() = customer_user_id);

create policy promissory_notes_merchant_select on public.promissory_notes
  for select using (public.is_merchant_owner(merchant_id));

create policy promissory_notes_admin_select on public.promissory_notes
  for select using (public.is_admin());

create policy promissory_notes_merchant_insert on public.promissory_notes
  for insert with check (public.is_merchant_owner(merchant_id));

create policy promissory_notes_merchant_update on public.promissory_notes
  for update using (public.is_merchant_owner(merchant_id))
              with check (public.is_merchant_owner(merchant_id));

create policy promissory_notes_admin_all on public.promissory_notes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- damage_cases — merchant raises; admin oversees; customer reads own
-- ---------------------------------------------------------------------
create policy damage_cases_customer_select on public.damage_cases
  for select using (auth.uid() = customer_user_id);

create policy damage_cases_merchant_select on public.damage_cases
  for select using (public.is_merchant_owner(merchant_id));

create policy damage_cases_admin_select on public.damage_cases
  for select using (public.is_admin());

create policy damage_cases_merchant_insert on public.damage_cases
  for insert with check (public.is_merchant_owner(merchant_id));

-- Merchant can update their own cases while still in the merchant-owned
-- 'review' or 'settlement' stages. Admin owns 'nafith' / 'execution'.
create policy damage_cases_merchant_update on public.damage_cases
  for update using (
    public.is_merchant_owner(merchant_id)
      and stage in ('review', 'settlement')
  )
  with check (public.is_merchant_owner(merchant_id));

create policy damage_cases_admin_all on public.damage_cases
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- damage_evidence — access mirrors parent case; merchant uploads,
-- admin manages, customer reads.
-- ---------------------------------------------------------------------
create policy damage_evidence_select on public.damage_evidence
  for select using (
    exists (
      select 1 from public.damage_cases c
      where c.id = damage_evidence.case_id
        and (
          c.customer_user_id = auth.uid()
          or public.is_merchant_owner(c.merchant_id)
          or public.is_admin()
        )
    )
  );

create policy damage_evidence_merchant_insert on public.damage_evidence
  for insert with check (
    exists (
      select 1 from public.damage_cases c
      where c.id = damage_evidence.case_id
        and public.is_merchant_owner(c.merchant_id)
    )
  );

create policy damage_evidence_admin_all on public.damage_evidence
  for all using (public.is_admin()) with check (public.is_admin());
