-- =====================================================================
-- Mandatory item-receipt photos inside the guided acceptance flow
-- (customer test fixes — Bugs 17 & 19, approved clarification).
-- =====================================================================
-- Product rule: after the customer approves the offer + contract, the
-- SAME guided flow moves to a receipt-photography step. The customer
-- uploads 1–4 images, can add/remove/replace them freely, then
-- CONFIRMS them. Confirmation locks the images permanently, and rental
-- activation is blocked until the contract is approved AND at least
-- one image is uploaded AND the images are confirmed.
--
-- What this migration adds (purely additive):
--   (1) public.contract_receipt_photos — one row per uploaded image,
--       hard-capped at 4 per contract, customer-owned.
--   (2) rental_contracts.receipt_photos_confirmed_at — the lock/gate
--       timestamp. NULL = not confirmed (images still editable,
--       activation blocked). NOT NULL = locked + activation unblocked.
--   (3) Three customer-only SECURITY DEFINER RPCs:
--         add_contract_receipt_photo(contract, path)  → uuid
--         remove_contract_receipt_photo(photo_id)     → void
--         confirm_contract_receipt_photos(contract)   → timestamptz
--   (4) A stricter replacement of
--       activate_rental_without_payment_and_note that refuses to
--       activate while receipt photos are missing or unconfirmed
--       (new errcode P0117). Everything else in the function body is
--       byte-identical to 20260502122400.
--   (5) Storage policies for the `receipts/<contract_id>/…` prefix of
--       the existing private `damage-evidence` bucket (same reuse
--       precedent as the handover/ prefix, 20260502121100). Objects
--       are only reachable by the contract's own customer (and
--       admins); the bucket stays private — the client displays
--       images through short-lived signed URLs only, never public
--       URLs or raw paths.
--
-- RLS: the table is customer-readable for own contracts; ALL writes go
-- through the RPCs (no INSERT/UPDATE/DELETE policies for clients), so
-- the ≤4 cap, the lock, and the ownership rules cannot be bypassed
-- with direct PostgREST calls.
--
-- Journey impact: none to the approved four stages. The photo step
-- lives INSIDE stage 2 (مراجعة العميل) — the contract stays 'pending'
-- until confirmation, and stage 3 (بدء الإيجار) still begins exactly at
-- activation.
--
-- Legacy: rental_contracts.handover_photo_path / handover_at and the
-- record_contract_handover RPC remain untouched (existing data keeps
-- rendering). New rentals use this flow instead.
--
-- RERUN SAFETY: the first production attempt of this file failed on
-- the CREATE TABLE (42703 — profiles(user_id) does not exist), so
-- under transactional execution nothing was applied. Every statement
-- here is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE
-- OR REPLACE), so this file also converges a NON-transactional
-- partial application (e.g. column/functions/storage policies created
-- while the table is missing) to the correct final state. Never run
-- the superseded 122300 file or other historical migrations again.
--
-- ROLLBACK (reverse order):
--   create or replace function public.activate_rental_without_payment_and_note
--     … re-apply the 20260502122400 body (drops the P0117 gate);
--   drop policy if exists "lend_receipts_insert" on storage.objects;
--   drop policy if exists "lend_receipts_select" on storage.objects;
--   drop policy if exists "lend_receipts_delete" on storage.objects;
--   drop function if exists public.confirm_contract_receipt_photos(uuid);
--   drop function if exists public.remove_contract_receipt_photo(uuid);
--   drop function if exists public.add_contract_receipt_photo(uuid, text);
--   alter table public.rental_contracts drop column receipt_photos_confirmed_at;
--   drop table if exists public.contract_receipt_photos;
-- Contracts activated before rollback stay valid; no data rewrite.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table + confirmation column
-- ---------------------------------------------------------------------

-- FIX (first production run failed with 42703): profiles has NO
-- user_id column — its PK is `id` (→ auth.users(id)), and every
-- ownership FK in this schema references profiles(id)
-- (rental_contracts.customer_user_id, damage_evidence.uploaded_by_user_id).
-- The uploader FK now follows the same model. `on delete restrict`
-- matches rental_contracts.customer_user_id — it adds no new deletion
-- blocking because the uploader is always the contract's customer,
-- whose profile is already restricted by the contract row itself.
create table if not exists public.contract_receipt_photos (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.rental_contracts(id) on delete cascade,
  uploaded_by  uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  unique (contract_id, storage_path)
);

comment on table public.contract_receipt_photos is
  'Customer-captured item receipt photos (1–4 per contract), uploaded inside the guided acceptance flow. Rows are immutable once rental_contracts.receipt_photos_confirmed_at is set.';

create index if not exists contract_receipt_photos_contract_idx
  on public.contract_receipt_photos (contract_id);

alter table public.rental_contracts
  add column if not exists receipt_photos_confirmed_at timestamptz;

comment on column public.rental_contracts.receipt_photos_confirmed_at is
  'When the customer confirmed the receipt photos. NULL = photos still editable and activation blocked; NOT NULL = photos locked, activation may proceed.';

-- ---------------------------------------------------------------------
-- 2. RLS — read own rows; all writes via RPCs only
-- ---------------------------------------------------------------------

alter table public.contract_receipt_photos enable row level security;

drop policy if exists receipt_photos_customer_select on public.contract_receipt_photos;
create policy receipt_photos_customer_select on public.contract_receipt_photos
  for select using (
    exists (
      select 1 from public.rental_contracts c
      where c.id = contract_id and c.customer_user_id = auth.uid()
    )
  );

drop policy if exists receipt_photos_merchant_select on public.contract_receipt_photos;
create policy receipt_photos_merchant_select on public.contract_receipt_photos
  for select using (
    exists (
      select 1 from public.rental_contracts c
      where c.id = contract_id and public.is_merchant_owner(c.merchant_id)
    )
  );

drop policy if exists receipt_photos_admin_select on public.contract_receipt_photos;
create policy receipt_photos_admin_select on public.contract_receipt_photos
  for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. RPCs — customer-only, ownership-checked, lock-aware
-- ---------------------------------------------------------------------

create or replace function public.add_contract_receipt_photo(
  p_contract_id  uuid,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_count    int;
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage_path required' using errcode = 'P0110';
  end if;

  -- Row lock on the contract serializes concurrent adds so the ≤4 cap
  -- cannot be raced past, and pins the confirmation check.
  select * into v_contract
  from rental_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contract not found' using errcode = 'P0111';
  end if;
  if v_contract.customer_user_id is distinct from auth.uid() then
    raise exception 'Only the contract customer can add receipt photos'
      using errcode = 'P0112';
  end if;
  if v_contract.receipt_photos_confirmed_at is not null then
    raise exception 'Receipt photos are confirmed and locked'
      using errcode = 'P0113';
  end if;
  if v_contract.status not in ('pending', 'active') then
    raise exception 'Contract is not awaiting receipt documentation (got %)',
      v_contract.status using errcode = 'P0114';
  end if;

  select count(*) into v_count
  from contract_receipt_photos
  where contract_id = p_contract_id;
  if v_count >= 4 then
    raise exception 'Maximum of 4 receipt photos per contract'
      using errcode = 'P0115';
  end if;

  insert into contract_receipt_photos (contract_id, uploaded_by, storage_path)
  values (p_contract_id, auth.uid(), p_storage_path)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_contract_receipt_photo(uuid, text) to authenticated;

create or replace function public.remove_contract_receipt_photo(
  p_photo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo    contract_receipt_photos%rowtype;
  v_contract rental_contracts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;

  select * into v_photo
  from contract_receipt_photos
  where id = p_photo_id;

  if not found then
    raise exception 'Receipt photo not found' using errcode = 'P0056';
  end if;

  select * into v_contract
  from rental_contracts
  where id = v_photo.contract_id
  for update;

  if v_contract.customer_user_id is distinct from auth.uid() then
    raise exception 'Only the contract customer can remove receipt photos'
      using errcode = 'P0112';
  end if;
  if v_contract.receipt_photos_confirmed_at is not null then
    raise exception 'Receipt photos are confirmed and locked'
      using errcode = 'P0113';
  end if;

  delete from contract_receipt_photos where id = p_photo_id;
end;
$$;

grant execute on function public.remove_contract_receipt_photo(uuid) to authenticated;

create or replace function public.confirm_contract_receipt_photos(
  p_contract_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract rental_contracts%rowtype;
  v_count    int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;

  -- Row lock: a double-tap / concurrent confirm serializes here; the
  -- second call sees the timestamp and returns it idempotently — no
  -- duplicate confirmation side effects.
  select * into v_contract
  from rental_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contract not found' using errcode = 'P0111';
  end if;
  if v_contract.customer_user_id is distinct from auth.uid() then
    raise exception 'Only the contract customer can confirm receipt photos'
      using errcode = 'P0112';
  end if;

  if v_contract.receipt_photos_confirmed_at is not null then
    return v_contract.receipt_photos_confirmed_at;
  end if;

  select count(*) into v_count
  from contract_receipt_photos
  where contract_id = p_contract_id;
  if v_count < 1 then
    raise exception 'At least one receipt photo is required'
      using errcode = 'P0116';
  end if;

  update rental_contracts
  set receipt_photos_confirmed_at = now(),
      updated_at                  = now()
  where id = p_contract_id;

  return now();
end;
$$;

grant execute on function public.confirm_contract_receipt_photos(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Activation gate — replace activate_rental_without_payment_and_note
-- ---------------------------------------------------------------------
-- Identical to the 20260502122400 body except for the receipt-photo
-- gate (P0117) inserted after the status check. Idempotency, ownership,
-- hold semantics and errcodes P0090–P0093 are unchanged.

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
  v_photos   int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;

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

  if v_contract.status = 'active' then
    return v_contract.id;
  end if;

  if v_contract.status <> 'pending' then
    raise exception 'Contract is not awaiting activation (got %)',
      v_contract.status using errcode = 'P0093';
  end if;

  -- Bugs 17/19 gate: no activation without >=1 uploaded AND confirmed
  -- receipt photos. The row lock above pins receipt_photos_confirmed_at
  -- against a concurrent confirm/add race.
  select count(*) into v_photos
  from contract_receipt_photos
  where contract_id = v_contract.id;
  if v_photos < 1 or v_contract.receipt_photos_confirmed_at is null then
    raise exception 'Receipt photos must be uploaded and confirmed before activation'
      using errcode = 'P0117';
  end if;

  select * into v_invoice
  from rental_invoices
  where id = v_contract.invoice_id;

  v_hold := coalesce(
    nullif(v_contract.original_item_value, 0),
    nullif(v_invoice.original_item_value, 0),
    v_contract.total_amount
  );

  update rental_contracts
  set status              = 'active',
      signed_at           = coalesce(signed_at, now()),
      original_item_value = case
        when coalesce(original_item_value, 0) = 0 then v_hold
        else original_item_value
      end,
      updated_at          = now()
  where id = v_contract.id;

  update rental_eligibility
  set used_amount = least(used_amount + v_hold, limit_amount),
      updated_at  = now()
  where user_id = v_contract.customer_user_id;

  return v_contract.id;
end;
$$;

grant execute on function public.activate_rental_without_payment_and_note(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. Storage policies — receipts/<contract_id>/… in damage-evidence
-- ---------------------------------------------------------------------
-- Uploads and reads are allowed ONLY to the customer who owns the
-- contract named in the path's second segment; deletes additionally
-- require the photos to still be unconfirmed (the lock). Admins can
-- read via the existing "admins read damage evidence" policy.

drop policy if exists "lend_receipts_insert" on storage.objects;
create policy "lend_receipts_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'damage-evidence'
    and name like 'receipts/%'
    and exists (
      select 1 from public.rental_contracts c
      where c.id::text = split_part(name, '/', 2)
        and c.customer_user_id = auth.uid()
        and c.receipt_photos_confirmed_at is null
    )
  );

drop policy if exists "lend_receipts_select" on storage.objects;
create policy "lend_receipts_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'damage-evidence'
    and name like 'receipts/%'
    and exists (
      select 1 from public.rental_contracts c
      where c.id::text = split_part(name, '/', 2)
        and (c.customer_user_id = auth.uid()
             or public.is_merchant_owner(c.merchant_id))
    )
  );

drop policy if exists "lend_receipts_delete" on storage.objects;
create policy "lend_receipts_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'damage-evidence'
    and name like 'receipts/%'
    and exists (
      select 1 from public.rental_contracts c
      where c.id::text = split_part(name, '/', 2)
        and c.customer_user_id = auth.uid()
        and c.receipt_photos_confirmed_at is null
    )
  );
