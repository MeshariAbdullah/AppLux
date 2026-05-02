-- =====================================================================
-- AppLux MVP — Phase 1 triggers, helper functions, and number generators
-- =====================================================================
-- * updated_at auto-bump trigger applied to every table that has it
-- * profile auto-creation on auth.users insert
-- * role helpers (current_role, is_admin, is_merchant_owner) used by
--   the RLS policies in the next migration
-- * sequence-backed document number generators
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger merchant_applications_set_updated_at
  before update on public.merchant_applications
  for each row execute function public.set_updated_at();

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at();

create trigger merchant_branches_set_updated_at
  before update on public.merchant_branches
  for each row execute function public.set_updated_at();

create trigger rental_eligibility_set_updated_at
  before update on public.rental_eligibility
  for each row execute function public.set_updated_at();

create trigger rental_invoices_set_updated_at
  before update on public.rental_invoices
  for each row execute function public.set_updated_at();

create trigger rental_contracts_set_updated_at
  before update on public.rental_contracts
  for each row execute function public.set_updated_at();

create trigger promissory_notes_set_updated_at
  before update on public.promissory_notes
  for each row execute function public.set_updated_at();

create trigger damage_cases_set_updated_at
  before update on public.damage_cases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create profile when a new auth user is created.
-- full_name is read from auth metadata; can be backfilled later via UI.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Role helpers — security definer so RLS policies can call them
-- without recursing into profile RLS.
-- ---------------------------------------------------------------------

create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_merchant_owner(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.merchants
    where id = p_merchant_id and owner_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Document number generators — produce human-readable references.
-- The application can call these via .rpc() or use them in defaults.
-- ---------------------------------------------------------------------

create or replace function public.next_invoice_number()
returns text
language sql
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-'
       || to_char(nextval('public.invoice_number_seq'), 'FM000000');
$$;

create or replace function public.next_contract_number()
returns text
language sql
as $$
  select 'CN-'  || to_char(now(), 'YYYY') || '-'
       || to_char(nextval('public.contract_number_seq'), 'FM000000');
$$;

create or replace function public.next_note_number()
returns text
language sql
as $$
  select 'PN-'  || to_char(now(), 'YYYY') || '-'
       || to_char(nextval('public.note_number_seq'), 'FM000000');
$$;

create or replace function public.next_case_number()
returns text
language sql
as $$
  select 'DC-'  || to_char(now(), 'YYYY') || '-'
       || to_char(nextval('public.case_number_seq'), 'FM000000');
$$;
