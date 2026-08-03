-- =====================================================================
-- Upload-receipt expiry hardening — fixes "انتهت صلاحية رفع المستند"
-- immediately after a SUCCESSFUL upload.
--
-- ROOT CAUSE: check_upload_receipt_valid uses `expires_at > now()` while
-- the signup claim trigger uses `expires_at <= now()`. For a ticket whose
-- expires_at is NULL these DISAGREE:
--   * `NULL > now()`  → NULL → the RPC's EXISTS is false → "invalid"
--   * `NULL <= now()` → NULL → the trigger's IF is not taken → "accepted"
-- The Edge function inserts a ticket WITHOUT an explicit expires_at,
-- relying on the column default. If a deployed environment's
-- merchant_upload_tickets lacks that default (schema drift vs. this repo,
-- which does define it), fresh tickets get expires_at = NULL, so the
-- client's pre-submit validity RPC reports a brand-new receipt as expired
-- and bounces the merchant to Step 5 — even though the claim would have
-- succeeded.
--
-- FIX (server-authoritative, no reliance on the browser):
--   1. Backfill any NULL expires_at to a future value.
--   2. Enforce the safe DEFAULT + NOT NULL so a ticket can NEVER be
--      created without a present, future expiry. This also makes the
--      trigger's `<= now()` NULL-safe BY CONSTRUCTION (NULL is now
--      impossible), so both checks use the same effective rule:
--      status='uploaded' AND expires_at present AND > now().
--   3. Make check_upload_receipt_valid NULL-explicit (defence in depth).
--   4. Add check_upload_receipt_status → a machine-readable result
--      (valid|expired|claimed|deleted|missing) so the client can route
--      precisely and never mislabel an unrelated signup failure as
--      "receipt expired".
--
-- Companion Edge-function change (merchant-doc-upload) explicitly inserts
-- expires_at as a belt-and-suspenders backstop. Redeploy it manually.
--
-- ROLLBACK: alter column expires_at drop not null; (default is harmless);
--           drop function public.check_upload_receipt_status(text);
--           restore check_upload_receipt_valid from 20260502124200.
-- NOT auto-applied.
-- =====================================================================

create extension if not exists pgcrypto;

-- 1. Backfill any NULL expiry (deployed drift). uploaded_at/created_at +
--    30 min keeps a just-uploaded ticket valid; long-abandoned ones land
--    in the past and are correctly treated as expired (cleanup removes
--    them). now() is the last resort.
update public.merchant_upload_tickets
   set expires_at = coalesce(uploaded_at, created_at, now()) + interval '30 minutes'
 where expires_at is null;

-- 2. Enforce the safe default + NOT NULL.
alter table public.merchant_upload_tickets
  alter column expires_at set default now() + interval '30 minutes';
alter table public.merchant_upload_tickets
  alter column expires_at set not null;

-- 3. Boolean validity — NULL-explicit (NOT NULL makes NULL unreachable,
--    but be unambiguous). Same effective rule as the claim trigger.
create or replace function public.check_upload_receipt_valid(p_receipt text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if coalesce(trim(p_receipt), '') = '' then
    return false;
  end if;
  v_hash := encode(digest(p_receipt, 'sha256'), 'hex');
  return exists (
    select 1 from public.merchant_upload_tickets
    where token_hash = v_hash
      and status = 'uploaded'
      and expires_at is not null
      and expires_at > now()
      and doc_type = 'commercial_registration'
  );
end;
$$;

revoke all on function public.check_upload_receipt_valid(text) from public;
grant execute on function public.check_upload_receipt_valid(text) to anon, authenticated;

-- 4. Machine-readable status (neutral — only a status word, no detail).
create or replace function public.check_upload_receipt_status(p_receipt text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash   text;
  v_ticket public.merchant_upload_tickets%rowtype;
begin
  if coalesce(trim(p_receipt), '') = '' then
    return 'missing';
  end if;
  v_hash := encode(digest(p_receipt, 'sha256'), 'hex');
  select * into v_ticket
    from public.merchant_upload_tickets
   where token_hash = v_hash;
  if not found then
    return 'missing';
  end if;
  if v_ticket.status = 'claimed' then
    return 'claimed';
  end if;
  if v_ticket.status = 'deleted' then
    return 'deleted';
  end if;
  if v_ticket.status <> 'uploaded'
     or v_ticket.doc_type <> 'commercial_registration'
     or v_ticket.storage_path is null then
    return 'missing';
  end if;
  if v_ticket.expires_at is null or v_ticket.expires_at <= now() then
    return 'expired';
  end if;
  return 'valid';
end;
$$;

revoke all on function public.check_upload_receipt_status(text) from public;
grant execute on function public.check_upload_receipt_status(text) to anon, authenticated;

comment on function public.check_upload_receipt_status(text) is
  'Neutral CR-document receipt status: valid|expired|claimed|deleted|missing. Same effective validity rule as check_upload_receipt_valid and the signup claim trigger. Takes the opaque receipt (only its SHA-256 hash is used); returns no ticket detail.';
