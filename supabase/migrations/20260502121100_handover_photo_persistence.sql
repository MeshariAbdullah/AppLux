-- =====================================================================
-- AppLux MVP — Phase 7f handover photo persistence
-- =====================================================================
-- The customer must capture a handover photo BEFORE physically
-- receiving the rental item from the merchant. SCRUM-41 Bug 6's first
-- pass kept this state in localStorage only — survives reload but
-- not browser changes, device changes, or cross-party verification.
-- This migration promotes it to a real DB-backed flow:
--
--   * rental_contracts gains handover_photo_path text + handover_at
--     timestamptz columns.
--   * record_contract_handover(p_contract_id uuid, p_photo_path text)
--     RPC writes them, SECURITY DEFINER, customer-only authorisation.
--   * Storage policies are added that permit authenticated INSERT and
--     SELECT for objects under the `handover/` prefix of the existing
--     `damage-evidence` bucket. The prefix is scoped so other bucket
--     policies stay untouched.
--
-- The bucket is reused (instead of creating a new `handover-evidence`
-- one) because damage-evidence is already provisioned and was
-- already validated with the merchant damage flow. If a dedicated
-- bucket is preferred later, only the client wrapper changes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.rental_contracts
  add column if not exists handover_photo_path text,
  add column if not exists handover_at         timestamptz;

-- ---------------------------------------------------------------------
-- 2. RPC — customer records handover for own contract
-- ---------------------------------------------------------------------
-- SECURITY DEFINER so the customer can write without a broad UPDATE
-- policy on rental_contracts (none currently exists for customers).
-- The function checks ownership itself.

create or replace function public.record_contract_handover(
  p_contract_id uuid,
  p_photo_path  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Trim and accept only non-empty paths.
  if p_photo_path is null or btrim(p_photo_path) = '' then
    raise exception 'photo_path required' using errcode = 'P0040';
  end if;

  select customer_user_id into v_owner
    from public.rental_contracts
   where id = p_contract_id;
  if v_owner is null then
    raise exception 'contract not found' using errcode = 'P0041';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'only the contract customer can record handover'
      using errcode = 'P0042';
  end if;

  update public.rental_contracts
     set handover_photo_path = p_photo_path,
         handover_at         = now(),
         updated_at          = now()
   where id = p_contract_id;
end;
$$;

grant execute on function public.record_contract_handover(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Storage policies — handover/ prefix inside damage-evidence bucket
-- ---------------------------------------------------------------------
-- We don't widen the bucket; we only add two narrow policies that
-- match objects whose name starts with "handover/". Existing
-- damage-evidence policies (managed elsewhere) are unaffected.
--
-- Both are idempotent — `if not exists` isn't supported on policies
-- across all Postgres versions, so we drop-then-create.

drop policy if exists "lend_handover_insert" on storage.objects;
create policy "lend_handover_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'damage-evidence'
    and name like 'handover/%'
  );

drop policy if exists "lend_handover_select" on storage.objects;
create policy "lend_handover_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'damage-evidence'
    and name like 'handover/%'
  );
